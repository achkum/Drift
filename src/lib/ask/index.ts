// OWNER: pipeline agent. Ask Drift: template answers computed from Insights. No network.
// Every number in an answer comes straight from Insights. Served vs chosen is always called an estimate.
import type { AskAnswer, Insights, Platform, TopicDelta, TopicDetail, TopicId } from '@/lib/types';

// ── formatting ──────────────────────────────────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const PLATFORM_NAMES: Record<Platform, string> = {
  youtube: 'YouTube', google_search: 'Google Search', tiktok: 'TikTok', instagram: 'Instagram',
};

export function formatMonth(m: string | undefined): string {
  if (!m) return '';
  const match = /^(\d{4})-(\d{2})/.exec(m);
  if (!match) return m;
  const idx = Number(match[2]) - 1;
  return MONTHS[idx] ? `${MONTHS[idx]} ${match[1]}` : m;
}

const pct = (n: number) => `${Math.round(n)}%`;
const points = (n: number) => {
  const r = Math.round(Math.abs(n));
  return `${r} percentage point${r === 1 ? '' : 's'}`;
};
const num = (n: number) => Math.round(n).toLocaleString('en');
const lower = (s: string) => s.toLowerCase();

function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const CHOSEN_CAVEAT =
  'This is an estimate: Drift counts something as chosen when you searched for it, follow the account, ' +
  'or liked, saved or shared it. Everything else you watched counts as served by the feed.';

// ── helpers over Insights ───────────────────────────────────────────

export function hasData(insights: Insights | null | undefined): insights is Insights {
  return !!insights && (insights.totals?.items ?? 0) > 0;
}

function topicLabel(insights: Insights, id: TopicId): string {
  return insights.topics[id]?.label
    ?? insights.rising.find((t) => t.topic === id)?.label
    ?? insights.falling.find((t) => t.topic === id)?.label
    ?? insights.monthly.find((t) => t.topic === id)?.label
    ?? id;
}

function allTopics(insights: Insights): { id: TopicId; label: string }[] {
  const m = new Map<TopicId, string>();
  for (const t of Object.values(insights.topics)) m.set(t.topic, t.label);
  for (const t of [...insights.rising, ...insights.falling, ...insights.monthly]) if (!m.has(t.topic)) m.set(t.topic, t.label);
  return [...m.entries()].filter(([id]) => id !== 'other').map(([id, label]) => ({ id, label }));
}

/** Topics the feed served most: share of items that were served/pushed, weighted by size. */
function mostPushed(insights: Insights): TopicDetail[] {
  return Object.values(insights.topics)
    .filter((t) => t.topic !== 'other' && t.itemCount > 0)
    .sort((a, b) => b.itemCount * b.servedPct - a.itemCount * a.servedPct);
}

// ── intent matching ─────────────────────────────────────────────────

/** A few Swedish words mapped to English so keyword matching works for both. */
const SWEDISH: Record<string, string> = {
  varför: 'why', valde: 'choose', välja: 'choose', valt: 'chosen', själv: 'chose',
  reklam: 'ads', annonser: 'ads', annons: 'ads', annonsörer: 'advertisers',
  vecka: 'week', veckan: 'week', ändra: 'change', förändra: 'change', ökade: 'rise', ökat: 'rise', ökar: 'rise',
  minskade: 'fall', minskat: 'fall', minskar: 'fall', flöde: 'feed', flödet: 'feed', mest: 'most', trycker: 'push',
  bubbla: 'bubble', smalare: 'narrow', politik: 'politics', nyheter: 'news', hälsa: 'health', träning: 'fitness',
  musik: 'music', spel: 'gaming', resor: 'travel', teknik: 'tech', ekonomi: 'finance', sammanfatta: 'summary',
  sammanfattning: 'summary', intressen: 'interests', ser: 'see', hur: 'how', vad: 'what', mig: 'me',
};

const STOP = new Set(['and', 'the', 'for', 'with', 'news', 'other', 'misc', 'videos', 'video', 'stuff', '&']);

function normalise(q: string): string {
  const words = lower(q).normalize('NFC').split(/[^\p{L}\p{N}'-]+/u).filter(Boolean);
  return words.map((w) => SWEDISH[w] ?? w).join(' ');
}

function hasWord(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

const RE = {
  week: [/\bweek(ly)?\b/, /\bdigest\b/, /\blately\b/, /\brecent(ly)?\b/, /\bthis month\b/],
  ads: [/\bads?\b/, /\badvert/, /\btarget/, /\bsponsor/, /\bmarketer/],
  interests: [/\binterests?\b/, /\bsee me\b/, /\bsees me\b/, /\bthink(s)? i\b/, /\bprofile\b/, /\bknow about me\b/],
  range: [/\bbubble\b/, /\bnarrow/, /\bvariety\b/, /\bvaried\b/, /\bdivers/, /\brange\b/, /\becho\b/],
  change: [/\bchange\b/, /\bcould i\b/, /\bshould i\b/, /\bcan i\b/, /\bimprove\b/, /\breset\b/, /\bfix\b/, /\bescape\b/, /\bwhat (can|do) i do\b/, /\btips?\b/],
  pushing: [/\bpush/, /\bfeed\b.*\bmost\b/, /\bserv(es|ing) me\b/, /\bshow(s|ing)? me most\b/, /\bmost served\b/, /\bfeeding\b/],
  chosen: [/\bchoo?se\b/, /\bchose\b/, /\bchosen\b/, /\bpick(ed)?\b/, /\bserved\b/, /\bdecide/, /\bon purpose\b/, /\bin control\b/, /\balgorithm/],
  rising: [/\brise\b/, /\brising\b/, /\brose\b/, /\bgrow/, /\bgrew\b/, /\bincreas/, /\bup\b/],
  falling: [/\bfall/, /\bfell\b/, /\bdrop/, /\bdeclin/, /\bdecreas/, /\bdown\b/, /\bdisappear/],
  turning: [/\bturning point/, /\bwhen did\b/, /\bwhen was\b/, /\bwhat happened\b/],
  overview: [/\bsummar/, /\boverview\b/, /\bheadline\b/, /\bdrift(ed|ing)?\b/, /\bbiggest\b/, /\bmain\b/, /\bwhat changed\b/],
};

function findTopic(text: string, insights: Insights): TopicId | null {
  let best: { id: TopicId; score: number } | null = null;
  for (const { id, label } of allTopics(insights)) {
    const full = lower(label);
    let score = 0;
    if (text.includes(full)) score = 3;
    else if (new RegExp(`\\b${escapeRe(lower(id))}\\b`).test(text)) score = 2;
    else {
      const words = full.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !STOP.has(w));
      // Loose stem match: "politics" vs "political", "football" vs "footballs".
      if (words.some((w) => new RegExp(`\\b${escapeRe(w.slice(0, Math.max(4, w.length - 2)))}`).test(text))) score = 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { id, score };
  }
  return best?.id ?? null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── answers ─────────────────────────────────────────────────────────

const BASIS = {
  trends: 'Based on your trends and sources.',
  chosen: (days: number) => `Based on your last ${days} days of activity. Served vs chosen is an estimate.`,
  ads: 'Based on the advertiser list and ads in your export.',
  week: 'Based on your weekly digest.',
  interests: 'Based on the interests your platforms list in your export, compared with what you watch.',
  range: 'Based on how many topics make up most of your viewing.',
};

function answerTopic(id: TopicId, insights: Insights): AskAnswer {
  const label = topicLabel(insights, id);
  const t = insights.topics[id];
  const delta: TopicDelta | undefined =
    insights.rising.find((d) => d.topic === id) ?? insights.falling.find((d) => d.topic === id);
  const paragraphs: string[] = [];

  // Prefer the topic detail (its months are known); fall back to the rising/falling delta.
  const from = t ? t.shareFrom : delta?.from;
  const to = t ? t.shareTo : delta?.to;
  if (from !== undefined && to !== undefined) {
    const span = t?.fromMonth && t?.toMonth ? ` between ${formatMonth(t.fromMonth)} and ${formatMonth(t.toMonth)}` : '';
    const d = to - from;
    const dir = Math.round(d) === 0 ? `stayed about the same at ${pct(to)}` : `went ${d > 0 ? 'up' : 'down'} from ${pct(from)} to ${pct(to)} of your viewing (${d > 0 ? '+' : '-'}${points(d)})`;
    let first = `${label} ${dir}${span}.`;
    if (t && t.itemCount > 0) {
      first += ` About ${pct(t.servedPct)} of the ${num(t.itemCount)} ${label} items were served to you rather than chosen (an estimate).`;
    }
    paragraphs.push(first);
  } else if (t) {
    paragraphs.push(`You have ${num(t.itemCount)} ${label} items. About ${pct(t.servedPct)} of them were served to you rather than chosen (an estimate).`);
  } else {
    paragraphs.push(`${label} shows up in your trends, but Drift doesn't have more detail on it yet.`);
  }

  const second: string[] = [];
  const tp = [...insights.turningPoints].reverse().find((p) => p.topic === id);
  if (tp) second.push(`The turning point was ${formatMonth(tp.month)}: ${tp.explanation}`);
  const sources = (t?.sources ?? []).slice().sort((a, b) => b.count - a.count).slice(0, 3);
  if (sources.length) {
    const s = sources.map((x) => `${x.name} (${num(x.count)}, ${x.subscribed ? 'you follow it' : x.origin === 'chosen' ? 'mostly chosen' : 'mostly served'})`);
    second.push(`Most of it came from ${listJoin(s)}.`);
  }
  if (second.length) paragraphs.push(second.join(' '));
  return { paragraphs, basis: BASIS.trends };
}

function answerChosen(insights: Insights): AskAnswer {
  const c = insights.chosen;
  const days = c.windowDays || 30;
  const paragraphs = [
    `In your last ${days} days, about ${pct(c.chosenPct)} of what you watched looks chosen by you and about ${pct(c.servedPct)} was served by the feed. ${CHOSEN_CAVEAT}`,
  ];
  const by = c.byPlatform.filter((p) => p.items > 0);
  if (by.length > 1) {
    const parts = by.slice().sort((a, b) => b.chosenPct - a.chosenPct)
      .map((p) => `${PLATFORM_NAMES[p.platform]} ${pct(p.chosenPct)} chosen (${num(p.items)} items)`);
    paragraphs.push(`By platform: ${listJoin(parts)}.`);
  } else if (by.length === 1) {
    paragraphs.push(`That is all from ${PLATFORM_NAMES[by[0].platform]} (${num(by[0].items)} items).`);
  }
  return { paragraphs, basis: BASIS.chosen(days) };
}

function answerPushing(insights: Insights): AskAnswer {
  const top = mostPushed(insights).slice(0, 3);
  if (top.length === 0) {
    return { paragraphs: ['Drift has no topic breakdown for your feed yet, so it cannot say what is pushed most.'], basis: BASIS.trends };
  }
  const [first, ...rest] = top;
  const paragraphs = [
    `${first.label} is what your feed pushes most: ${num(first.itemCount)} items, of which about ${pct(first.servedPct)} were served rather than chosen (an estimate).`,
  ];
  if (rest.length) {
    paragraphs.push(`Next come ${listJoin(rest.map((t) => `${t.label} (${num(t.itemCount)} items, about ${pct(t.servedPct)} served)`))}.`);
  }
  return { paragraphs, basis: BASIS.trends };
}

function answerChange(insights: Insights): AskAnswer {
  const paragraphs: string[] = [];
  const servedRising = insights.rising
    .map((d) => ({ d, t: insights.topics[d.topic] }))
    .filter((x) => x.d.topic !== 'other' && x.t && x.t.servedPct >= 50)
    .slice(0, 2);
  if (servedRising.length) {
    const names = servedRising.map((x) => `${x.d.label} (+${points(x.d.delta)}, about ${pct(x.t!.servedPct)} served)`);
    paragraphs.push(
      `The growth in ${listJoin(names)} mostly came from the feed, not from you. If you don't want more of it, ` +
      'use "Not interested" on those videos, stop autoplay, or remove a few of them from your watch history.',
    );
  } else {
    const top = mostPushed(insights)[0];
    if (top) {
      paragraphs.push(`${top.label} is the topic your feed serves most (about ${pct(top.servedPct)} served, an estimate). "Not interested", turning off autoplay or pruning watch history are the quickest ways to dial it down.`);
    }
  }
  const c = insights.chosen;
  const tail: string[] = [];
  if (c.servedPct > 0) {
    tail.push(`Right now about ${pct(c.servedPct)} of your viewing is served. Searching for what you want and subscribing to channels you trust raises the chosen share.`);
  }
  if (insights.range.narrowing && insights.range.topicsThen > 0) {
    tail.push(`Your viewing has narrowed from ${num(insights.range.topicsThen)} to ${num(insights.range.topicsNow)} topics, so deliberately looking up something new also helps.`);
  }
  if (tail.length) paragraphs.push(tail.join(' '));
  if (paragraphs.length === 0) {
    paragraphs.push('Nothing in your data stands out as pushed hard by the feed. Searching for what you want and following accounts you trust keeps it that way.');
  }
  return { paragraphs, basis: BASIS.trends };
}

function answerWeek(insights: Insights): AskAnswer {
  const d = insights.digest;
  if (!d.lines.length) {
    return { paragraphs: ["There's no weekly digest yet: Drift needs at least one full week of recent activity."], basis: BASIS.week };
  }
  const head = d.weekOf ? `In the week of ${d.weekOf}:` : 'This week:';
  return { paragraphs: [`${head} ${d.lines.slice(0, 4).join(' ')}`], basis: BASIS.week };
}

function answerAds(insights: Insights): AskAnswer {
  const ads = insights.ads;
  const advertisers = ads.advertisers.slice().sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  if (advertisers.length === 0 && ads.adItems === 0) {
    return { paragraphs: ["Your export doesn't list any advertisers or ads, so Drift can't say who targets you."], basis: BASIS.ads };
  }
  const paragraphs: string[] = [];
  if (advertisers.length) {
    const top = advertisers.slice(0, 5).map((a) => (a.count ? `${a.name} (${num(a.count)})` : a.name));
    paragraphs.push(`Your export lists ${num(advertisers.length)} advertiser${advertisers.length === 1 ? '' : 's'}. The top ${top.length === 1 ? 'one is' : `${top.length} are`} ${listJoin(top)}.`);
  }
  if (ads.adItems > 0) {
    paragraphs.push(`You watched or clicked ${num(ads.adItems)} item${ads.adItems === 1 ? '' : 's'} that came from ads. Drift counts these as pushed, not chosen.`);
  }
  return { paragraphs, basis: BASIS.ads };
}

function answerInterests(insights: Insights): AskAnswer {
  const lists = insights.platformInterests.filter((p) => p.interests.length > 0);
  if (lists.length === 0) {
    return { paragraphs: ["Your export doesn't include the interests a platform assigned to you."], basis: BASIS.interests };
  }
  const paragraphs = lists.slice(0, 2).map((p) => {
    const matching = p.interests.filter((i) => i.matches).length;
    const sample = p.interests.slice(0, 5).map((i) => i.name);
    return `${PLATFORM_NAMES[p.platform]} has you down for ${num(p.interests.length)} interests, such as ${listJoin(sample)}. ` +
      `${num(matching)} of them match what you actually watch.`;
  });
  if (insights.actualTopics.length) {
    paragraphs.push(`What you actually watch most: ${listJoin(insights.actualTopics.slice(0, 4))}.`);
  }
  return { paragraphs: paragraphs.slice(0, 2), basis: BASIS.interests };
}

function answerRange(insights: Insights): AskAnswer {
  const r = insights.range;
  if (!r.topicsThen && !r.topicsNow) {
    return { paragraphs: ['Drift needs a few months of history to measure your topic range.'], basis: BASIS.range };
  }
  const verdict = r.narrowing ? 'Your viewing has narrowed' : r.topicsNow > r.topicsThen ? 'Your viewing has widened' : 'Your range is about the same';
  return {
    paragraphs: [
      `${verdict}: in ${formatMonth(r.monthThen)}, ${num(r.topicsThen)} topics made up 80% of what you watched; in ${formatMonth(r.monthNow)} it was ${num(r.topicsNow)}.`,
    ],
    basis: BASIS.range,
  };
}

function answerMovers(insights: Insights, which: 'rising' | 'falling'): AskAnswer {
  const list = insights[which].filter((d) => d.topic !== 'other').slice(0, 3);
  if (list.length === 0) {
    return { paragraphs: [`No topic is clearly ${which} in your history yet.`], basis: BASIS.trends };
  }
  const parts = list.map((d) => `${d.label} (${pct(d.from)} to ${pct(d.to)})`);
  const paragraphs = [`${which === 'rising' ? 'Growing' : 'Shrinking'} the most: ${listJoin(parts)}.`];
  const t = insights.topics[list[0].topic];
  if (t) paragraphs.push(`For ${t.label}, about ${pct(t.servedPct)} was served rather than chosen (an estimate). Ask "Why did ${t.label} ${which === 'rising' ? 'rise' : 'fall'}?" for the details.`);
  return { paragraphs, basis: BASIS.trends };
}

function answerTurning(insights: Insights): AskAnswer {
  const tps = insights.turningPoints.slice(-3).reverse();
  if (tps.length === 0) return answerOverview(insights);
  return {
    paragraphs: tps.slice(0, 2).map((p) => `${formatMonth(p.month)}: ${p.label} went ${p.direction}. ${p.explanation}`),
    basis: BASIS.trends,
  };
}

function answerOverview(insights: Insights): AskAnswer {
  const paragraphs: string[] = [];
  if (insights.headline.title) paragraphs.push([insights.headline.title, insights.headline.detail].filter(Boolean).join(' '));
  const span = insights.months.length ? ` from ${formatMonth(insights.months[0])} to ${formatMonth(insights.months[insights.months.length - 1])}` : '';
  paragraphs.push(`Drift looked at ${num(insights.totals.items)} items${span}, including ${num(insights.totals.watches)} watches and ${num(insights.totals.searches)} searches.`);
  return { paragraphs: paragraphs.slice(0, 2), basis: BASIS.trends };
}

function noData(): AskAnswer {
  return {
    paragraphs: [
      "There's no data of yours to answer from yet. Import your YouTube, TikTok or Instagram export and Drift can tell you what your feed pushes, what you chose, and how it changed.",
    ],
    basis: 'Nothing has been imported on this device.',
  };
}

function fallback(insights: Insights): AskAnswer {
  const examples = suggestedQuestions(insights).map((q) => `"${q}"`);
  return {
    paragraphs: [
      "I couldn't match that to your data. I can answer questions about why a topic grew or shrank, how much of your viewing you chose, what your feed pushes most, who targets you with ads, what changed this week, and what you could change.",
      examples.length ? `Try ${listJoin(examples.slice(0, 3))}.` : 'Try asking about one of your topics by name.',
    ],
    basis: 'Drift only answers from your own imported data, on this device.',
  };
}

// ── public API ──────────────────────────────────────────────────────

export function suggestedQuestions(insights: Insights): string[] {
  if (!hasData(insights)) {
    return ['How much of my viewing did I choose?', 'What is my feed pushing most?', 'What could I change?'];
  }
  const out: string[] = [];
  const rising = insights.rising.find((d) => d.topic !== 'other' && d.delta > 0);
  if (rising) out.push(`Why did ${lower(rising.label)} rise for me?`);
  out.push('How much of my viewing did I choose?');
  if (Object.keys(insights.topics).length > 0) out.push('What is my feed pushing most?');
  if (insights.digest.lines.length) out.push('What changed this week?');
  if (insights.ads.advertisers.length || insights.ads.adItems) out.push('Who targets me with ads?');
  out.push('What could I change?');
  if (out.length < 3 && insights.range.topicsThen) out.push('Is my feed getting narrower?');
  return out.slice(0, 5);
}

export function answerQuestion(question: string, insights: Insights): AskAnswer {
  const text = normalise(question ?? '');
  if (!hasData(insights)) return noData();
  if (!text.trim()) return fallback(insights);

  const topic = findTopic(text, insights);
  // A named topic wins, unless the question is clearly about ads or the weekly digest.
  if (topic && !hasWord(text, RE.ads) && !hasWord(text, RE.week)) return answerTopic(topic, insights);

  if (hasWord(text, RE.week)) return answerWeek(insights);
  if (hasWord(text, RE.ads)) return answerAds(insights);
  if (hasWord(text, RE.interests)) return answerInterests(insights);
  if (hasWord(text, RE.range)) return answerRange(insights);
  if (hasWord(text, RE.change) && !/\bwhat changed\b/.test(text)) return answerChange(insights);
  if (hasWord(text, RE.pushing)) return answerPushing(insights);
  if (hasWord(text, RE.chosen)) return answerChosen(insights);
  if (hasWord(text, RE.turning)) return answerTurning(insights);
  if (hasWord(text, RE.falling)) return answerMovers(insights, 'falling');
  if (hasWord(text, RE.rising)) return answerMovers(insights, 'rising');
  if (hasWord(text, RE.overview)) return answerOverview(insights);
  return fallback(insights);
}
