// OWNER: household agent. THE privacy boundary: Insights → SharedSummary.
//
// Everything another household member can ever see about a person passes
// through buildSharedSummary. It copies fields one by one (allow-list), never
// spreads Insights objects, and never reads recentItems, turningPoints
// (free text), headline (may name a hidden topic) or anything with titles/URLs.
import { TOPICS, interestTopic } from '@/lib/analysis';
import type { Insights, TopicDelta, TopicId } from '@/lib/types';
import type { SafetyAlert, ShareCategory, ShareSettings, SharedAlert, SharedSummary, SharedTopicSeries } from './types';
import { SHARE_CATEGORIES } from './types';

const SENSITIVE_IDS = new Set(TOPICS.filter((t) => t.sensitive).map((t) => t.id));
const SENSITIVE_LABELS = TOPICS.filter((t) => t.sensitive).map((t) => t.label.toLowerCase());
/** Extra words that name sensitive topics in free text (digest lines). */
const SENSITIVE_WORDS = ['politic', 'news', 'election', 'diet', 'weight', 'health', 'religio', 'faith', 'dating', 'sex', 'relationship', 'mental'];

export const MAX_SOURCES_PER_TOPIC = 5;
export const MAX_SOURCE_TOPICS = 8;
export const MAX_ADVERTISERS = 20;
const MAX_NAME = 80;

export function isSensitiveTopic(insights: Pick<Insights, 'topics'> | null, topic: TopicId): boolean {
  return SENSITIVE_IDS.has(topic) || insights?.topics?.[topic]?.sensitive === true;
}

export function categoriesFromSettings(s: Partial<ShareSettings> | null | undefined): ShareCategory[] {
  if (!s) return [];
  return SHARE_CATEGORIES.filter((c) => s[c] === true);
}

const clip = (s: string) => (s.length > MAX_NAME ? `${s.slice(0, MAX_NAME - 1)}…` : s);
const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);
const delta = (d: TopicDelta): TopicDelta => ({ topic: d.topic, label: clip(d.label), from: num(d.from), to: num(d.to), delta: num(d.delta) });

export interface BuildSummaryOptions {
  /** Own safety alerts; included only with the 'alerts' category and after the teen-first delay. */
  alerts?: SafetyAlert[];
  now?: Date;
  /** Default ALERT_SHARE_DELAY_MS (48 h). */
  alertDelayMs?: number;
}

export const ALERT_SHARE_DELAY_MS = 48 * 60 * 60 * 1000;

/**
 * Builds the minimal summary another member may see. `categories` are the
 * categories the owner of `insights` turned on for that recipient.
 */
export function buildSharedSummary(
  insights: Insights,
  categories: readonly ShareCategory[] | Partial<ShareSettings>,
  opts: BuildSummaryOptions = {},
): SharedSummary {
  const cats = new Set<ShareCategory>(Array.isArray(categories) ? categories : categoriesFromSettings(categories as Partial<ShareSettings>));
  const allowSensitive = cats.has('sensitive');
  const hidden = (t: TopicId) => !allowSensitive && isSensitiveTopic(insights, t);

  const out: SharedSummary = {
    v: 1,
    generatedAt: String(insights.generatedAt ?? ''),
    categories: SHARE_CATEGORIES.filter((c) => cats.has(c)),
    allowQuestions: cats.has('questions'),
  };

  if (cats.has('trends')) {
    const months = [...(insights.months ?? [])].map(String);
    const monthly: SharedTopicSeries[] = [];
    let hiddenShares: number[] | null = null;
    let otherRow: SharedTopicSeries | null = null;
    for (const row of insights.monthly ?? []) {
      const shares = (row.shares ?? []).map(num);
      if (hidden(row.topic)) {
        hiddenShares = hiddenShares ? hiddenShares.map((v, i) => v + (shares[i] ?? 0)) : shares;
        continue;
      }
      const r = { topic: row.topic, label: clip(row.label), shares };
      if (row.topic === 'other') otherRow = r; else monthly.push(r);
    }
    if (hiddenShares) {
      // Merge hidden topics into 'other' so the chart still adds up without naming them.
      otherRow = otherRow
        ? { ...otherRow, shares: otherRow.shares.map((v, i) => num(v + (hiddenShares![i] ?? 0))) }
        : { topic: 'other', label: 'Other', shares: hiddenShares.map(num) };
    }
    if (otherRow) monthly.push(otherRow);

    const r = insights.range;
    out.trends = {
      months,
      monthly,
      rising: (insights.rising ?? []).filter((d) => !hidden(d.topic)).map(delta),
      falling: (insights.falling ?? []).filter((d) => !hidden(d.topic)).map(delta),
      range: {
        monthThen: String(r?.monthThen ?? ''), topicsThen: num(r?.topicsThen),
        monthNow: String(r?.monthNow ?? ''), topicsNow: num(r?.topicsNow), narrowing: r?.narrowing === true,
      },
      digest: { weekOf: String(insights.digest?.weekOf ?? ''), lines: filterDigest(insights, cats) },
      totals: { items: num(insights.totals?.items), watches: num(insights.totals?.watches), searches: num(insights.totals?.searches) },
    };
  }

  if (cats.has('sources')) {
    const c = insights.chosen;
    const topics = Object.values(insights.topics ?? {})
      .filter((t) => t && t.topic !== 'other' && t.topic !== 'unknown' && !hidden(t.topic))
      .sort((a, b) => num(b.itemCount) - num(a.itemCount))
      .slice(0, MAX_SOURCE_TOPICS)
      .map((t) => ({
        topic: t.topic,
        label: clip(t.label),
        servedPct: num(t.servedPct),
        itemCount: num(t.itemCount),
        sources: [...(t.sources ?? [])]
          .sort((a, b) => num(b.count) - num(a.count))
          .slice(0, MAX_SOURCES_PER_TOPIC)
          .map((s) => ({ name: clip(String(s.name)), platform: s.platform, count: num(s.count), origin: s.origin === 'chosen' ? 'chosen' as const : 'served' as const, subscribed: s.subscribed === true })),
      }));
    out.sources = {
      chosen: {
        windowDays: num(c?.windowDays), chosenPct: num(c?.chosenPct), servedPct: num(c?.servedPct),
        byPlatform: (c?.byPlatform ?? []).map((p) => ({ platform: p.platform, chosenPct: num(p.chosenPct), items: num(p.items) })),
      },
      topics,
    };
  }

  if (cats.has('ads')) {
    out.ads = {
      advertisers: [...(insights.ads?.advertisers ?? [])]
        .sort((a, b) => num(b.count) - num(a.count))
        .slice(0, MAX_ADVERTISERS)
        .map((a) => (a.count === undefined ? { name: clip(a.name), platform: a.platform } : { name: clip(a.name), platform: a.platform, count: num(a.count) })),
      adItems: num(insights.ads?.adItems),
      platformInterests: (insights.platformInterests ?? []).map((p) => ({
        platform: p.platform,
        interests: (p.interests ?? [])
          .filter((i) => allowSensitive || !interestIsSensitive(i.name))
          .map((i) => ({ name: clip(i.name), matches: i.matches === true })),
      })),
    };
  }

  if (cats.has('alerts')) {
    out.alerts = shareableAlerts(opts.alerts ?? [], opts.now ?? new Date(), opts.alertDelayMs ?? ALERT_SHARE_DELAY_MS);
  }

  return out;
}

function interestIsSensitive(name: string): boolean {
  const t = interestTopic(name);
  if (t && SENSITIVE_IDS.has(t)) return true;
  return mentionsSensitive(name);
}

function mentionsSensitive(text: string): boolean {
  const l = text.toLowerCase();
  return SENSITIVE_LABELS.some((s) => l.includes(s)) || SENSITIVE_WORDS.some((w) => l.includes(w));
}

/**
 * Digest lines are generated text, so they are filtered rather than trusted:
 * no URLs, no quoted text, no item titles, no hidden topics, and channel
 * names ("New in your feed: …") only when sources are shared.
 */
function filterDigest(insights: Insights, cats: Set<ShareCategory>): string[] {
  const titles = Object.values(insights.topics ?? {})
    .flatMap((t) => (t?.recentItems ?? []).map((i) => (i.title ?? '').toLowerCase().trim()))
    .filter((t) => t.length >= 4);
  const hiddenLabels = cats.has('sensitive') ? [] : Object.values(insights.topics ?? {})
    .filter((t) => t && isSensitiveTopic(insights, t.topic)).map((t) => t.label.toLowerCase());
  return (insights.digest?.lines ?? []).filter((line) => {
    if (typeof line !== 'string' || line.length > 200) return false;
    const l = line.toLowerCase();
    if (/https?:|www\.|\.com\b|["“”‘’«»]/.test(l)) return false;
    if (/\bsearch(ed)? for\b/.test(l)) return false;
    if (titles.some((t) => l.includes(t))) return false;
    if (!cats.has('sensitive') && (mentionsSensitive(l) || hiddenLabels.some((h) => l.includes(h)))) return false;
    if (!cats.has('sources') && /new in your feed/.test(l)) return false;
    return true;
  }).slice(0, 6);
}

/** Alerts the member has had for at least `delayMs`, not dismissed. */
export function shareableAlerts(alerts: SafetyAlert[], now: Date, delayMs = ALERT_SHARE_DELAY_MS): SharedAlert[] {
  return alerts
    .filter((a) => !a.dismissed && now.getTime() - Date.parse(a.detectedAt) >= delayMs)
    .map((a) => ({
      id: a.id, topic: a.topic, label: a.label, fromShare: a.fromShare, toShare: a.toShare,
      fromMonth: a.fromMonth, toMonth: a.toMonth, toldMemberAt: a.detectedAt, message: a.message,
    }));
}
