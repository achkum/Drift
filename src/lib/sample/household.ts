// OWNER: UI agent. Household preview data. Not backed by real data in v1.

export type MemberKey = 'you' | 'sam' | 'maya';
export type ShareCategory = 'trends' | 'sources' | 'ads' | 'ai';
export type ShareFlags = Record<ShareCategory, boolean>;
export type ShareFlagsWithSensitive = ShareFlags & { sens: boolean };
export type Viewer = 'sam' | 'maya';

export const MEMBER_LABELS = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];

export interface MemberSeries {
  name: string;
  vals: number[];
  color: string;
  dash?: boolean;
  warn?: boolean;
}

export interface CmpGroup {
  t: string;
  self: number;
  you?: number;
  drift: number;
  res: number;
}

export interface Member {
  key: MemberKey;
  first: string;
  displayName: string;
  initial: string;
  avatarClass: string;
  color: string;
  alert: boolean;
  driftLabel: string;
  sub: string;
  series: MemberSeries[];
  changes: string[];
  chosen: number;
  platforms: [string, number][];
  srcTopic: string;
  srcRows: [string, string, 'served' | 'chosen'][];
  ads: [string, string, number][];
  tactics: [string, number][];
  ig: [string, [string, boolean][]];
  cmp: CmpGroup[];
  cmpNote: string;
  /** What this member shares with you (defaults; teen consent can change Maya's). */
  shared: ShareFlags;
}

const ALL_ON: ShareFlags = { trends: true, sources: true, ads: true, ai: true };

export const MEMBERS: Record<MemberKey, Member> = {
  you: {
    key: 'you', first: 'You', displayName: 'You', initial: 'You', avatarClass: 'av-you', color: 'var(--accent)', alert: false,
    driftLabel: 'Drift adults', sub: 'Owner, all your insights',
    series: [
      { name: 'Politics', vals: [6, 7, 10, 15, 19, 21], color: 'var(--accent)' },
      { name: 'Football', vals: [31, 30, 28, 24, 22, 20], color: 'var(--t1)' },
      { name: 'Cooking', vals: [14, 13, 12, 12, 11, 10], color: 'var(--muted-line)', dash: true },
      { name: 'Fitness', vals: [3, 4, 5, 6, 8, 9], color: 'var(--served)' },
    ],
    changes: [
      'Politics grew from 6% to 21% of your viewing, mostly since July.',
      'Football fell by 11 points after the season ended.',
      '81% of your political viewing was served, not searched for.',
    ],
    chosen: 38, platforms: [['YouTube', 44], ['Google Search', 100], ['TikTok', 12]],
    srcTopic: 'Politics',
    srcRows: [
      ['The Morning Ledger', 'YouTube, 48 videos', 'served'],
      ['@hottakes.daily', 'TikTok, 112 videos', 'served'],
      ['Civic Desk', 'YouTube, 19 videos, subscribed', 'chosen'],
    ],
    ads: [['Northwind News app', 'Politics', 18], ['Streamly', 'Football', 12], ['Harbor Home Loans', 'Home loans', 9]],
    tactics: [['Fake urgency', 8], ['Fake discounts', 6]],
    ig: ['Instagram', [['Running', true], ['Cooking', true], ['Luxury travel', false], ['Home loans', false], ['Parenting', false]]],
    cmp: [
      { t: 'Politics', self: 21, drift: 13, res: 8 },
      { t: 'Football', self: 20, drift: 15, res: 14 },
      { t: 'Fitness', self: 9, drift: 9, res: 12 },
    ],
    cmpNote: 'Your politics viewing is about 1.6 times other adult Drift users and well above published research.',
    shared: ALL_ON,
  },
  sam: {
    key: 'sam', first: 'Sam', displayName: 'Sam', initial: 'S', avatarClass: 'av-sam', color: 'var(--accent)', alert: false,
    driftLabel: 'Drift adults', sub: 'Partner. Shared with you, updated today.',
    series: [
      { name: 'Tech', vals: [28, 27, 26, 26, 25, 24], color: 'var(--t1)' },
      { name: 'Cycling', vals: [10, 12, 15, 18, 20, 22], color: 'var(--accent)' },
      { name: 'Cooking', vals: [14, 14, 13, 13, 12, 12], color: 'var(--muted-line)', dash: true },
      { name: 'Travel', vals: [18, 16, 14, 12, 10, 9], color: 'var(--served)' },
    ],
    changes: [
      'Cycling is Sam’s fastest-growing topic, up 12 points since May.',
      'Travel fell by half after the summer.',
      'Tech is still his biggest topic and has barely moved.',
    ],
    chosen: 52, platforms: [['YouTube', 61], ['Google Search', 100], ['Instagram', 30]],
    srcTopic: 'Cycling',
    srcRows: [
      ['[Cycling channel A]', 'YouTube, 41 videos, subscribed', 'chosen'],
      ['[Route-planning account B]', 'Instagram, 18 videos', 'served'],
      ['Searches about gravel bikes', 'Google, 12 searches', 'chosen'],
    ],
    ads: [['[Bike retailer A]', 'Cycling', 22], ['[Travel site B]', 'Travel', 11], ['[Bank C]', 'Home loans', 7]],
    tactics: [['Fake discounts', 9], ['Fake urgency', 5]],
    ig: ['Instagram', [['Cycling', true], ['Travel', false], ['Home loans', false], ['Tech', true], ['Cooking', true]]],
    cmp: [
      { t: 'Cycling', self: 22, you: 4, drift: 9, res: 8 },
      { t: 'Tech', self: 24, you: 12, drift: 17, res: 16 },
      { t: 'Travel', self: 9, you: 10, drift: 11, res: 10 },
    ],
    cmpNote: 'Sam’s cycling is about 2.4 times other adult Drift users. His travel is now slightly below average.',
    shared: ALL_ON,
  },
  maya: {
    key: 'maya', first: 'Maya', displayName: 'Maya, 15', initial: 'M', avatarClass: 'av-maya', color: 'var(--amber)', alert: true,
    driftLabel: 'Drift teens 13–17', sub: 'Teen. Shared by Maya, week of 28 Sep.',
    series: [
      { name: 'Gaming', vals: [34, 33, 32, 30, 29, 27], color: 'var(--t1)' },
      { name: 'Fitness', vals: [8, 9, 12, 16, 19, 22], color: 'var(--accent)' },
      { name: 'Dieting', vals: [1, 1, 2, 6, 12, 19], color: 'var(--amber)', warn: true },
      { name: 'Music', vals: [20, 19, 18, 17, 16, 15], color: 'var(--muted-line)', dash: true },
    ],
    changes: [
      'Dieting went from 1% to 19% of Maya’s viewing, mostly since August.',
      'Fitness grew steadily first. Most dieting content followed fitness videos.',
      'Gaming is still her biggest topic but is down 7 points.',
    ],
    chosen: 21, platforms: [['YouTube', 28], ['TikTok', 9], ['Instagram', 16]],
    srcTopic: 'Dieting',
    srcRows: [
      ['[Fitness channel A]', 'YouTube, 34 videos', 'served'],
      ['[Account B]', 'TikTok, 21 videos', 'served'],
      ['Food and fitness searches', 'Google, 6 searches', 'chosen'],
    ],
    ads: [['[Supplement brand A]', 'Fitness', 14], ['[Weight-loss app B]', 'Dieting', 9], ['[Sportswear brand C]', 'Fitness', 18]],
    tactics: [['Fake urgency', 11], ['Before-and-after claims', 6], ['Fake discounts', 4]],
    ig: ['Instagram', [['Fitness', true], ['Dieting', true], ['Beauty', false], ['Gaming', true], ['Pop music', false]]],
    cmp: [
      { t: 'Dieting', self: 19, you: 2, drift: 6, res: 5 },
      { t: 'Fitness', self: 22, you: 8, drift: 14, res: 12 },
      { t: 'Gaming', self: 27, you: 5, drift: 24, res: 20 },
    ],
    cmpNote: 'Maya’s dieting viewing is about 3 times other Drift users aged 13–17. Her fitness is 1.6 times. Gaming is normal for her age.',
    shared: ALL_ON,
  },
};

export const VIEWER_NAMES: Record<Viewer, string> = { sam: 'Sam', maya: 'Maya' };

/** What you share with each person (defaults). */
export const SHARE: Record<Viewer, ShareFlagsWithSensitive> = {
  sam: { trends: true, sources: false, ads: true, ai: true, sens: false },
  maya: { trends: false, sources: false, ads: false, ai: false, sens: false },
};

export interface CmpRowData {
  n: string;
  s?: string;
  v: number;
  c: string;
  /** 'r' = published research (dashed bar). */
  k?: 'r';
}

export const CMP: Record<'fitness' | 'gaming' | 'politics', { label: string; rows: CmpRowData[]; note: string }> = {
  fitness: {
    label: 'Fitness',
    rows: [
      { n: 'You', v: 9, c: 'var(--t1)' }, { n: 'Sam', v: 10, c: 'var(--accent)' }, { n: 'Maya', v: 22, c: 'var(--amber)' },
      { n: 'Drift adults', s: 'Anonymous, opt-in', v: 9, c: 'var(--muted-line)' },
      { n: 'Drift teens 13–17', s: 'Anonymous, opt-in', v: 14, c: 'var(--muted-line)' },
      { n: 'Published research', s: '[Report name, year]', v: 12, c: 'var(--muted-line)', k: 'r' },
    ],
    note: 'Maya’s fitness viewing is about 1.6 times other teens on Drift. You and Sam are close to other adults.',
  },
  gaming: {
    label: 'Gaming',
    rows: [
      { n: 'You', v: 5, c: 'var(--t1)' }, { n: 'Sam', v: 7, c: 'var(--accent)' }, { n: 'Maya', v: 27, c: 'var(--amber)' },
      { n: 'Drift adults', s: 'Anonymous, opt-in', v: 6, c: 'var(--muted-line)' },
      { n: 'Drift teens 13–17', s: 'Anonymous, opt-in', v: 24, c: 'var(--muted-line)' },
      { n: 'Published research', s: '[Report name, year]', v: 20, c: 'var(--muted-line)', k: 'r' },
    ],
    note: 'Maya’s gaming is high but typical for her age group. It is falling, not rising.',
  },
  politics: {
    label: 'Politics',
    rows: [
      { n: 'You', v: 21, c: 'var(--t1)' }, { n: 'Sam', v: 12, c: 'var(--accent)' }, { n: 'Maya', v: 2, c: 'var(--amber)' },
      { n: 'Drift adults', s: 'Anonymous, opt-in', v: 13, c: 'var(--muted-line)' },
      { n: 'Drift teens 13–17', s: 'Anonymous, opt-in', v: 4, c: 'var(--muted-line)' },
      { n: 'Published research', s: '[Report name, year]', v: 8, c: 'var(--muted-line)', k: 'r' },
    ],
    note: 'Your politics viewing is about 1.6 times other adult Drift users and well above published research. Sam is close to average.',
  },
};

export interface ScriptedQA {
  q: string;
  a: string[];
  basis: string;
}

export interface AskScript {
  who: string;
  note: string;
  intro: string;
  fallback: string;
  qs: ScriptedQA[];
}

export type AskKey = 'you' | 'sam' | 'maya' | 'household';

/** Ask Drift copy. 'you' only uses who/note/intro/fallback; its answers come from src/lib/ask. */
export const ASK: Record<AskKey, AskScript> = {
  you: {
    who: 'About you', note: 'Answers are worked out on this device. Nothing is uploaded.',
    intro: 'Ask me about your own feed: why topics changed, where they came from, or what you could change.',
    fallback: 'I can answer from your trends, sources and ads. Try one of the suggested questions, or ask about one of your topics.',
    qs: [],
  },
  sam: {
    who: 'About Sam', note: 'Answers are worked out on Sam’s phone from what he allowed. He sees every question you ask.',
    intro: 'Ask me about Sam’s feed. I use only what Sam has allowed, and I never show individual videos or searches.',
    fallback: 'I can answer from what Sam has allowed: his trends, sources and ads. Try one of the suggested questions.',
    qs: [
      { q: 'What is Sam’s feed pushing most?', a: ['Cycling. It is up 12 points since May to 22% of his viewing. About half came from channels he subscribes to, and the rest was served, mostly short videos on Instagram.'], basis: 'Based on Sam’s trends and sources.' },
      { q: 'Are our feeds similar?', a: ['Not much. Your top topics are Politics (21%) and Football (20%). His are Tech (24%) and Cycling (22%).', 'The overlap is Cooking: 10% for you and 12% for him. You also both see Home loans ads.'], basis: 'Based on your trends and Sam’s trends and ads.' },
      { q: 'Why did travel drop?', a: ['Travel fell from 18% to 9%. His trip-related searches stopped after August, and the platforms stopped serving as many travel videos. That often happens once a trip is over.'], basis: 'Based on Sam’s trends and sources.' },
      { q: 'Are we targeted differently?', a: ['Yes. Sam’s top advertisers sell bikes, travel and loans. Yours are a news app, a streaming service and a loan provider. His ads use fake discounts most; yours use fake urgency.'], basis: 'Based on your ads and Sam’s ads.' },
    ],
  },
  maya: {
    who: 'About Maya', note: 'Answers are worked out on Maya’s phone from what she allowed. She sees every question you ask.',
    intro: 'Ask me about Maya’s feed. I use only what Maya has allowed, and I never show individual videos or messages. Answers are estimates, not diagnoses.',
    fallback: 'I can answer from what Maya has allowed: her trends, where topics came from, and her ads. Try one of the suggested questions.',
    qs: [
      { q: 'Why did dieting content start showing up?', a: ['It began in August, right after Maya watched more fitness videos. Since then, about 9 in 10 dieting videos were served to her rather than searched for. One channel, [Fitness channel A], accounts for 34 of the 61 videos, mostly through autoplay.', 'Her food and fitness searches in August likely gave the platform a starting point.'], basis: 'Based on Maya’s trends and sources.' },
      { q: 'Is this normal for her age?', a: ['Fitness growth is common: it is up for other Drift users aged 13–17 over the same months. But dieting at 19% is about 3 times the 6% typical for that group, and published research puts it near 5%.', 'That makes it worth a gentle conversation. It shows what her feed is serving, not how she feels or behaves.'], basis: 'Based on Maya’s trends, anonymous Drift users aged 13–17 and published research [Report name, year]. Sample data.' },
      { q: 'How do her ads compare to mine?', a: ['Maya sees far more weight-loss and supplement ads: 23 of her top 41, while none of yours are in that category. Several use fake urgency and before-and-after claims.', 'These ads draw on Fitness and Dieting, interests Instagram has assigned to her.'], basis: 'Based on Maya’s ads and your ads.' },
      { q: 'What should I say to her?', a: ['Start from curiosity, not the data. For example: "I’ve noticed a lot of fitness content around lately. What’s showing up for you?" Remind her she is told first and sees everything you see.', 'Avoid asking about food or her body at the start, and don’t bring up specific videos. If you are worried about her health, a doctor or [youth support line] can help.'], basis: 'General guidance, informed by Maya’s trends.' },
    ],
  },
  household: {
    who: 'About the household', note: 'Uses only what each member allows. Each member sees the questions asked about them.',
    intro: 'Ask me about the whole household: who is changing, what you have in common, and how you compare with others.',
    fallback: 'I can answer from what each of you has allowed. Try one of the suggested questions.',
    qs: [
      { q: 'Who has changed the most since May?', a: ['Maya has moved the most: Dieting is up 18 points and Fitness up 14. You come next, with Politics up 15 points. Sam’s biggest move is Cycling, up 12 points.', 'Teen feeds usually change faster than adult feeds, so Maya’s pace is expected. The direction of the change is what matters.'], basis: 'Based on everyone’s trends, as each person allowed.' },
      { q: 'Which topics do we have in common?', a: ['Fitness is the only topic that shows up for all three of you, at 9%, 10% and 22%. You and Sam also share Cooking, at 10% and 12%.', 'Maya’s main topics, Gaming and Music, barely overlap with yours.'], basis: 'Based on everyone’s trends.' },
      { q: 'How do we compare with other households?', a: ['In households with a teen on Drift, teen feeds change fastest and adult topics stay steadier. Maya’s rate of change is higher than most other teens, mainly because of Dieting.', 'Your own politics viewing is the main adult outlier.'], basis: 'Based on anonymous Drift households and published research [Report name, year]. Sample data.' },
    ],
  },
};

/** Questions household members asked about you. */
export const QLOG: { who: string; initial: string; avatarClass: string; q: string; meta: string }[] = [
  { who: 'Sam', initial: 'S', avatarClass: 'av-sam', q: 'What is your feed pushing most?', meta: '3 Oct. Used your topic trends.' },
  { who: 'Sam', initial: 'S', avatarClass: 'av-sam', q: 'Why did your football drop?', meta: '29 Sep. Used your topic trends.' },
];

export function isMemberKey(v: string): v is MemberKey {
  return v === 'you' || v === 'sam' || v === 'maya';
}

export function isAskKey(v: string | undefined): v is AskKey {
  return v === 'you' || v === 'sam' || v === 'maya' || v === 'household';
}
