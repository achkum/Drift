// Ask Drift about another household member. Answers are computed on the asker's
// device from the summary that member shared (never from anything else), by
// mapping the SharedSummary into an Insights-shaped object and reusing the
// regular answer templates. The caller must logQuestion() before showing it.
import { answerQuestion } from '@/lib/ask';
import type { AskAnswer, Insights, TopicDetail } from '@/lib/types';
import type { ShareCategory, SharedSummary } from './types';

/** An Insights object holding only what the summary contains. Missing sections are empty. */
export function insightsFromSummary(s: SharedSummary): Insights {
  const t = s.trends;
  const months = t?.months ?? [];
  const first = months[0] ?? '';
  const last = months[months.length - 1] ?? '';
  const topics: Record<string, TopicDetail> = {};
  for (const st of s.sources?.topics ?? []) {
    const row = t?.monthly.find((m) => m.topic === st.topic);
    // Prefer the rising/falling delta (its window matches what the UI shows as "rising").
    const d = t?.rising.find((x) => x.topic === st.topic) ?? t?.falling.find((x) => x.topic === st.topic);
    topics[st.topic] = {
      topic: st.topic, label: st.label, sensitive: false,
      shareFrom: d?.from ?? row?.shares[0] ?? 0, shareTo: d?.to ?? row?.shares[row.shares.length - 1] ?? 0,
      fromMonth: d ? '' : first, toMonth: d ? '' : last,
      servedPct: st.servedPct, itemCount: st.itemCount,
      sources: st.sources.map((x) => ({ ...x })),
      recentItems: [],
    };
  }
  const sourceItems = (s.sources?.topics ?? []).reduce((n, x) => n + x.itemCount, 0);
  return {
    generatedAt: s.generatedAt,
    months,
    platforms: [],
    totals: t?.totals ?? { items: sourceItems || (s.ads?.adItems ?? 0), watches: 0, searches: 0 },
    headline: { title: '', detail: '' },
    monthly: t?.monthly ?? [],
    rising: t?.rising ?? [],
    falling: t?.falling ?? [],
    chosen: s.sources?.chosen ?? { windowDays: 30, chosenPct: 0, servedPct: 0, byPlatform: [] },
    turningPoints: [],
    topics,
    range: t?.range ?? { monthThen: '', topicsThen: 0, monthNow: '', topicsNow: 0, narrowing: false },
    platformInterests: s.ads?.platformInterests ?? [],
    actualTopics: (t?.monthly ?? []).filter((m) => m.topic !== 'other')
      .sort((a, b) => (b.shares.at(-1) ?? 0) - (a.shares.at(-1) ?? 0)).map((m) => m.label),
    ads: {
      advertisers: s.ads?.advertisers ?? [], adItems: s.ads?.adItems ?? 0,
      tactics: (s.ads?.tactics ?? []).map((x) => ({ ...x, examples: [] })), trickyAdItems: s.ads?.trickyAdItems,
    },
    digest: t?.digest ?? { weekOf: '', lines: [] },
  };
}

/** Rewrites a second-person answer ("your feed") about someone else ("Maya's feed"). */
export function aboutPerson(text: string, name: string): string {
  return text
    .replace(/\byou're\b/gi, `${name} is`)
    .replace(/\byou've\b/gi, `${name} has`)
    .replace(/\byours\b/gi, `${name}'s`)
    .replace(/\byour\b/gi, `${name}'s`)
    .replace(/\byourself\b/gi, name)
    .replace(/\byou\b/gi, name)
    .replace(new RegExp(`\\b${escapeRe(name)} (follow|watch|search|like|see|get|do|have|are|want)\\b`, 'g'), (_m, v: string) => `${name} ${VERB[v] ?? v}`)
    .replace(/\bmy\b/gi, `${name}'s`)
    .replace(/\bme\b/gi, name);
}

const VERB: Record<string, string> = {
  follow: 'follows', watch: 'watches', search: 'searches', like: 'likes', see: 'sees', get: 'gets', do: 'does', have: 'has', are: 'is', want: 'wants',
};

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Which shared categories an answer drew on, from its basis line. */
export function categoriesForAnswer(a: AskAnswer, s: SharedSummary): ShareCategory[] {
  const b = `${a.basis} ${a.paragraphs.join(' ')}`.toLowerCase();
  const out = new Set<ShareCategory>();
  if (/trend|digest|topics make up|went (up|down)|stayed/.test(b)) out.add('trends');
  if (/source|chosen|served|activity/.test(b)) out.add('sources');
  if (/advertis|\bads?\b|interest/.test(b)) out.add('ads');
  const allowed = new Set(s.categories);
  const used = [...out].filter((c) => allowed.has(c));
  return used.length ? used : (['trends', 'sources', 'ads'] as const).filter((c) => allowed.has(c)).slice(0, 1);
}

export interface MemberAnswer extends AskAnswer {
  categories: ShareCategory[];
}

/** Answers a question about a member from their shared summary only. */
export function answerAboutMember(question: string, s: SharedSummary, name: string): MemberAnswer {
  const q = question.replace(new RegExp(`\\b${escapeRe(name)}(['’]s)?(?!\\w)`, 'gi'), (_m, poss?: string) => (poss ? 'my' : 'me'));
  const a = answerQuestion(q, insightsFromSummary(s));
  const categories = categoriesForAnswer(a, s);
  return {
    paragraphs: a.paragraphs.filter((p) => p.trim()).map((p) => aboutPerson(p, name)),
    basis: `Based only on what ${name} shares with you: ${categories.map((c) => CAT_WORD[c]).join(', ') || 'nothing yet'}.`,
    categories,
  };
}

export const CAT_WORD: Record<ShareCategory, string> = {
  trends: 'trends', sources: 'sources', ads: 'ads', questions: 'questions', sensitive: 'sensitive topics', alerts: 'safety alerts',
};

/** Suggested questions that the shared sections can answer. */
export function suggestedAboutMember(s: SharedSummary, name: string): string[] {
  const out: string[] = [];
  const rising = s.trends?.rising.find((d) => d.topic !== 'other' && d.delta > 0);
  if (rising) out.push(`Why did ${rising.label.toLowerCase()} rise for ${name}?`);
  if (s.sources) out.push(`What is ${name}’s feed pushing most?`, `How much of ${name}’s viewing was chosen?`);
  if (s.trends?.digest.lines.length) out.push('What changed this week?');
  if (s.ads) out.push(`Who targets ${name} with ads?`);
  if (s.trends && !s.sources) out.push(`What changed for ${name} lately?`);
  return out.slice(0, 4);
}
