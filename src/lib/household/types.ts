// OWNER: household agent. Types for household mode (MVP 4).
// These are local to src/lib/household; src/lib/types.ts stays untouched.
import type { Platform, TopicDelta, TopicId } from '@/lib/types';

/** Adult = partner or other adult. Teen = 13–17, decides over their own data. */
export type HouseholdRole = 'owner' | 'adult' | 'teen';
/** Role an invite is created for. The owner role is never invited. */
export type InviteRole = 'adult' | 'teen';

/**
 * What a person can share with one other member. All off by default.
 *
 * UI mapping from `src/lib/sample/household.ts`: `ai` → `questions`, `sens` → `sensitive`.
 * `alerts` is new: a teen decides whether safety alerts reach the parent (after a delay).
 */
export type ShareCategory = 'trends' | 'sources' | 'ads' | 'questions' | 'sensitive' | 'alerts';

export const SHARE_CATEGORIES: readonly ShareCategory[] = ['trends', 'sources', 'ads', 'questions', 'sensitive', 'alerts'];

export type ShareSettings = Record<ShareCategory, boolean> & {
  /** ISO time of the last change, or '' when never set. */
  updatedAt: string;
};

/** Public keys of a device, base64url of the raw uncompressed P-256 point. */
export interface PublicKeys {
  /** ECDH P-256, used to receive encrypted summaries and notes. */
  ecdh: string;
  /** ECDSA P-256, used to sign requests, envelopes and admissions. */
  ecdsa: string;
}

/** This device's identity, as the UI sees it. */
export interface Me {
  memberId: string;
  /** Short, human comparable form of memberId, e.g. "K3QF-9XPA-2M7C". */
  fingerprint: string;
  displayName: string;
  role: HouseholdRole | null;
  household: { id: string; name: string; ownerId: string; isOwner: boolean; joinedAt: string } | null;
}

export type MemberStatus =
  /** Joined and confirmed by the owner's device. Summaries flow. */
  | 'active'
  /** Redeemed an invite; waits until the owner's device confirms the join proof. */
  | 'pending'
  /** Owner only: invite created on this device, not redeemed yet. */
  | 'invited';

export interface HouseholdMember {
  memberId: string;
  /** Display name from the member's encrypted profile. 'Invited' / 'New member' until known. */
  displayName: string;
  role: HouseholdRole | null;
  status: MemberStatus;
  isMe: boolean;
  isOwner: boolean;
  joinedAt?: string;
  /** For status 'invited': local invite id and expiry. */
  invite?: { id: string; expiresAt: string; role: InviteRole };
  fingerprint?: string;
}

export interface CreatedInvite {
  id: string;
  role: InviteRole;
  expiresAt: string;
  /** The secret part: `<token>.<ownerFingerprint>`. Never sent to the server. */
  fragment: string;
  /** Full link, `${origin}/join#<fragment>`. */
  url: string;
  /** Text to encode in a QR code (same as url). */
  qrPayload: string;
}

// ── Shared summary: the privacy boundary ────────────────────────────

/** A topic month series, share of viewing in percent. */
export interface SharedTopicSeries {
  topic: TopicId;
  label: string;
  shares: number[];
}

export interface SharedTopicSources {
  topic: TopicId;
  label: string;
  /** Percent of this topic's items that were served or pushed. */
  servedPct: number;
  itemCount: number;
  /** Channel / account names with counts. Never item titles or URLs. */
  sources: { name: string; platform: Platform; count: number; origin: 'chosen' | 'served'; subscribed: boolean }[];
}

export interface SharedAlert {
  id: string;
  topic: TopicId;
  label: string;
  fromShare: number;
  toShare: number;
  fromMonth: string;
  toMonth: string;
  /** When the member's own device showed the alert to them ("told first"). */
  toldMemberAt: string;
  message: string;
}

/**
 * The only thing that leaves a device about its owner's feed. Built by
 * `buildSharedSummary` from Insights. Every section is present only when the
 * matching category is shared. Never contains recentItems, item titles,
 * URLs, search text or messages.
 */
export interface SharedSummary {
  v: 1;
  /** Insights.generatedAt of the source. */
  generatedAt: string;
  /** Categories that were on when this was built. */
  categories: ShareCategory[];
  /** True when `questions` is on: the recipient may ask Drift about this member. */
  allowQuestions: boolean;
  trends?: {
    months: string[];
    /** Hidden sensitive topics are merged into 'other' so totals still add up. */
    monthly: SharedTopicSeries[];
    rising: TopicDelta[];
    falling: TopicDelta[];
    range: { monthThen: string; topicsThen: number; monthNow: string; topicsNow: number; narrowing: boolean };
    /** Weekly digest lines that passed the privacy filter. */
    digest: { weekOf: string; lines: string[] };
    totals: { items: number; watches: number; searches: number };
  };
  sources?: {
    chosen: { windowDays: number; chosenPct: number; servedPct: number; byPlatform: { platform: Platform; chosenPct: number; items: number }[] };
    topics: SharedTopicSources[];
  };
  ads?: {
    advertisers: { name: string; platform: Platform; count?: number }[];
    adItems: number;
    platformInterests: { platform: Platform; interests: { name: string; matches: boolean }[] }[];
  };
  alerts?: SharedAlert[];
}

/** A decrypted summary from another member, as cached on this device. */
export interface ReceivedSummary {
  memberId: string;
  displayName: string;
  role: HouseholdRole | null;
  summary: SharedSummary;
  /** Signed creation time of the envelope. */
  sharedAt: string;
  receivedAt: string;
}

// ── Safety alerts ───────────────────────────────────────────────────

export interface SafetyAlert {
  /** Deterministic: `${topic}:${toMonth}` so re-detection doesn't duplicate. */
  id: string;
  topic: TopicId;
  label: string;
  fromShare: number;
  toShare: number;
  fromMonth: string;
  toMonth: string;
  /** Points risen within the window. */
  rise: number;
  /** When this device first detected and showed it. */
  detectedAt: string;
  /** The member said "This doesn't look right"; never shared afterwards. */
  dismissed?: boolean;
  message: string;
}

/** An alert as the UI lists it: own alerts plus alerts others shared with you. */
export interface SafetyAlertView extends SafetyAlert {
  /** 'me' for alerts about this device's owner, else the member it is about. */
  about: 'me' | string;
  aboutName: string;
  /** For others' alerts: when that member was told (always before you). */
  toldMemberAt: string;
}

// ── Questions log ───────────────────────────────────────────────────

export interface QuestionNote {
  id: string;
  askerId: string;
  askerName: string;
  question: string;
  /** Which shared categories the answer used. */
  categories: ShareCategory[];
  askedAt: string;
}
