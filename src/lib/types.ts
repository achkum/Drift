/**
 * Shared contracts for Drift. Every module (parsers, analysis, pipeline, UI)
 * builds against these types. Change them only through the orchestrator.
 */

// ── Raw data from exports ───────────────────────────────────────────

export type Platform = 'youtube' | 'google_search' | 'tiktok' | 'instagram';

/** What the user did. Ads are things shown to the user by an advertiser. */
export type EventKind =
  | 'watch'      // watched / viewed a video or post
  | 'search'     // typed a search query
  | 'like'
  | 'save'       // favourite, saved, added to playlist
  | 'share'
  | 'comment'
  | 'ad';        // an ad shown or clicked

export interface Channel {
  name: string;
  url?: string;
}

/** One item of activity, normalised across platforms. */
export interface DriftEvent {
  /** Stable id: `${platform}:${kind}:${time}:${itemId ?? url ?? title}` hashed or joined. Must be deterministic so re-imports dedupe. */
  id: string;
  platform: Platform;
  kind: EventKind;
  /** ISO 8601 timestamp (UTC). */
  time: string;
  /** Video / post title when the export has one. TikTok watch history has none. */
  title?: string;
  url?: string;
  /** Platform id of the item (YouTube video id, TikTok video id...). */
  itemId?: string;
  channel?: Channel;
  /** Search text for kind === 'search'. */
  query?: string;
  /** True when the export marks it as coming from ads (YouTube "From Google Ads"). */
  fromAds?: boolean;
  /** 'lookup' when the title was fetched later by the opt-in title lookup (only the video id/link was sent). */
  titleSource?: 'export' | 'lookup';
}

/** A channel / account the user subscribes to or follows. */
export interface FollowRecord {
  platform: Platform;
  name: string;
  url?: string;
  /** ISO date when known. */
  since?: string;
}

/** Interests a platform has assigned to the user (ad interests, "your topics"). */
export interface PlatformInterestList {
  platform: Platform;
  interests: string[];
}

/** An advertiser that showed ads to the user or holds their data. */
export interface AdvertiserRecord {
  platform: Platform;
  name: string;
  /** Number of ads seen, when the export says. */
  count?: number;
}

/** One file from an export, already unzipped. */
export interface ExportFile {
  /** Path inside the archive, forward slashes, e.g. "Takeout/YouTube and YouTube Music/history/watch-history.json". */
  path: string;
  /** Read as UTF-8 text. */
  text(): Promise<string>;
}

export interface ParseResult {
  platform: Platform | 'mixed';
  events: DriftEvent[];
  follows: FollowRecord[];
  interests: PlatformInterestList[];
  advertisers: AdvertiserRecord[];
  /** Human readable, shown after import ("search-history.json not found, searches skipped"). */
  warnings: string[];
  /** Paths actually used. */
  filesUsed: string[];
}

export interface ExportParser {
  /** Platform id this parser handles. */
  id: 'youtube' | 'tiktok' | 'instagram';
  label: string;
  /** True if any of the files look like this platform's export. Cheap: check paths only. */
  detect(files: ExportFile[]): boolean;
  parse(files: ExportFile[]): Promise<ParseResult>;
}

// ── Export guides (manual upload instructions) ──────────────────────

export interface ExportGuide {
  platform: 'youtube' | 'tiktok' | 'instagram';
  /** e.g. "Get your YouTube data" */
  title: string;
  /** One sentence: who prepares the file and how long it takes. */
  intro: string;
  /** Exact, specific steps. Each step one action. Bold UI labels with **double asterisks**. */
  steps: string[];
  /** Direct link to start the export, when one exists. */
  startUrl?: string;
  /** Typical wait, e.g. "Minutes to a few hours". */
  waitTime: string;
  /** What to upload: "the .zip file", "the whole folder or .zip". */
  uploadHint: string;
  /** Format must be JSON etc. Shown as callouts. */
  notes: string[];
}

// ── Analysis ────────────────────────────────────────────────────────

export type TopicId = string; // e.g. 'politics', 'football', 'other'

export interface TopicDef {
  id: TopicId;
  label: string;
  /** Politics, health, religion, sexuality... only shown to the owner. */
  sensitive: boolean;
}

export interface TopicClassifier {
  name: string;
  /** Returns one topic per input, same order. 'other' when unsure. */
  classify(items: { title?: string; channel?: string; query?: string; url?: string }[]): Promise<{ topic: TopicId; confidence: number }[]>;
}

/**
 * How an item got in front of the user (see proposal table):
 * chosen  = searched for it, subscribed/followed, or came back to it on purpose
 * engaged = liked, saved, shared, commented on something the feed showed
 * served  = shown and watched, no sign the user picked it
 * pushed  = an ad
 */
export type Origin = 'chosen' | 'engaged' | 'served' | 'pushed';

export interface ClassifiedEvent extends DriftEvent {
  topic: TopicId;
  topicConfidence: number;
  origin: Origin;
  /** Short reason, e.g. "followed a search for 'marathon training'", "subscribed channel". */
  originReason: string;
}

export interface TopicDelta {
  topic: TopicId;
  label: string;
  /** Share of viewing, percent 0-100. */
  from: number;
  to: number;
  /** to - from, percentage points. */
  delta: number;
}

export interface TopicSource {
  name: string;
  platform: Platform;
  count: number;
  origin: 'chosen' | 'served';
  subscribed: boolean;
}

export interface TopicDetail {
  topic: TopicId;
  label: string;
  sensitive: boolean;
  shareFrom: number;
  shareTo: number;
  fromMonth: string; // 'YYYY-MM'
  toMonth: string;
  /** Percent of this topic's items that were served or pushed (not chosen/engaged). */
  servedPct: number;
  itemCount: number;
  sources: TopicSource[];
  /** Up to 50 most recent items, for "Show the videos". */
  recentItems: { title?: string; url?: string; time: string; origin: Origin; platform: Platform }[];
}

export interface TurningPoint {
  month: string; // 'YYYY-MM'
  topic: TopicId;
  label: string;
  direction: 'up' | 'down';
  /** Plain-language one-liner, e.g. "Mostly served to you after news clips autoplayed. You didn't search for it." */
  explanation: string;
}

export interface Insights {
  generatedAt: string;
  /** Months covered, 'YYYY-MM', oldest first. */
  months: string[];
  platforms: { platform: Platform; items: number; from: string; to: string }[];
  totals: { items: number; watches: number; searches: number };

  headline: { title: string; detail: string; topic?: TopicId };

  /** Share of viewing per topic per month (percent 0-100), top topics only (max 8) + 'other'. */
  monthly: { topic: TopicId; label: string; shares: number[] }[];

  rising: TopicDelta[];
  falling: TopicDelta[];

  /** Last 30 days of data (relative to latest event). */
  chosen: {
    windowDays: number;
    chosenPct: number;   // chosen + engaged
    servedPct: number;   // served + pushed
    byPlatform: { platform: Platform; chosenPct: number; items: number }[];
  };

  turningPoints: TurningPoint[];
  topics: Record<TopicId, TopicDetail>;

  /** Topic range: how many topics make up 80% of viewing, early vs recent. */
  range: { monthThen: string; topicsThen: number; monthNow: string; topicsNow: number; narrowing: boolean };

  /** "How platforms see you": platform's assigned interests vs what the user actually watches. */
  platformInterests: { platform: Platform; interests: { name: string; matches: boolean }[] }[];
  /** Labels of the user's top actual topics, most first. */
  actualTopics: string[];

  /** trickyAdItems: distinct ads with at least one tactic (an ad can use several, so don't sum tactic counts). */
  ads: { advertisers: AdvertiserRecord[]; adItems: number; tactics: AdTactic[]; trickyAdItems?: number };

  /** Which topic classifier produced these results, e.g. 'keyword' or 'ml-e5'. */
  classifier?: string;
  /** Set when the user asked for the topic model but it could not load (shown in settings). */
  classifierNote?: string;

  /** Weekly digest for the latest full week. */
  digest: { weekOf: string; lines: string[] };
}

/** A manipulative ad technique found in ad titles (fear, fake urgency, fake discounts, scams...). */
export interface AdTactic {
  id: 'fake_urgency' | 'fake_discount' | 'fear' | 'scam' | 'before_after' | 'too_good' | string;
  label: string;
  count: number;
  /** Up to 3 example ad titles. */
  examples: string[];
}

// ── Settings ────────────────────────────────────────────────────────

/** User choices that change how data is processed. Stored on the device. */
export interface DriftSettings {
  /** Use the on-device ML topic model (downloads a model once) instead of keywords only. */
  smartTopics: boolean;
  /** Look up missing titles (TikTok, removed videos) by sending only video ids/links. Off by default. */
  titleLookup: boolean;
}

// ── Import / storage ────────────────────────────────────────────────

export interface ImportRecord {
  id: string;
  platform: Platform | 'mixed';
  importedAt: string;
  fileName: string;
  events: number;
  newEvents: number;
  warnings: string[];
}

export interface ImportProgress {
  stage: 'reading' | 'unzipping' | 'parsing' | 'enriching' | 'loading-model' | 'classifying' | 'analysing' | 'saving' | 'done' | 'error';
  message: string;
  /** 0-1 when known. */
  fraction?: number;
}

// ── Ask Drift ───────────────────────────────────────────────────────

export interface AskAnswer {
  paragraphs: string[];
  /** e.g. "Based on your trends and sources." */
  basis: string;
}
