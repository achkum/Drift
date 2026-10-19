// OWNER: MVP2 ads agent. Finds manipulative techniques in ad titles (fear, fake urgency, fake discounts, scams).
// English and Swedish phrase lists. Precision over recall: every pattern is word-bounded, and loose
// words like "free", "gratis", "invest" only count in the phrases that make them manipulative.
import type { AdTactic, ClassifiedEvent } from '@/lib/types';

// Unicode-aware word boundaries (JS \b treats å, ä, ö as non-word characters).
const B = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';
const W = '[\\p{L}\\p{N}\'’]+';
/** Up to n words in between. */
const gap = (n: number) => `(?:\\s+${W}){0,${n}}\\s+`;

function words(...alts: string[]): RegExp {
  return new RegExp(`${B}(?:${alts.join('|')})${E}`, 'iu');
}

interface TacticDef {
  id: AdTactic['id'];
  label: string;
  patterns: RegExp[];
  /** Extra check for things a regex can't say well (e.g. "at least 50% off"). */
  test?: (text: string) => boolean;
}

const NUM = '\\d{1,3}(?:[ ,.]\\d{3})*';
const MONEY = `(?:[$€£]\\s?${NUM}|${NUM}\\s?(?:kr|kronor|sek|usd|eur|dollars?|euros?|\\$|€|£))`;

const CELEBS = [
  'elon musk', 'bill gates', 'jeff bezos', 'warren buffett', 'mark zuckerberg', 'martin lewis', 'oprah',
  'skavlan', 'zlatan', 'leif gw persson', 'ulf kristersson', 'magdalena andersson', 'dragons[’\']? den',
  'shark tank', 'draknästet',
].join('|');

const TACTICS: TacticDef[] = [
  {
    id: 'fake_urgency',
    label: 'Fake urgency',
    patterns: [
      words(
        'last chance', 'final chance', 'only today', 'today only', 'one day only', '24 hours only',
        'ends (?:tonight|today|at midnight|soon|sunday|tomorrow)', 'hurry(?: up)?', 'act (?:now|fast)',
        'limited[- ]time(?: only| offer| deal)?', 'while (?:supplies|stocks?) lasts?', "don[’']?t miss (?:out|it)",
        `only ${NUM} left`, '(?:offer|deal|sale) (?:expires|ends)', 'final hours', 'last day', "before it[’']?s gone",
        'selling fast', 'almost sold out',
        // Swedish
        'sista chansen', 'sista dagen', 'sista timmarna', '(?:endast|bara|gäller endast|gäller bara) (?:idag|i dag|ikväll|i kväll)',
        'slutar (?:ikväll|i kväll|idag|i dag|snart|vid midnatt|imorgon|i morgon)', 'skynda(?: dig| er)?',
        'begränsad tid', 'tidsbegränsat(?: erbjudande)?', 'så länge lagret räcker', 'missa inte', `bara ${NUM} kvar`,
        'nästan slutsåld', 'snart slut',
      ),
    ],
  },
  {
    id: 'fake_discount',
    label: 'Huge or too-good discounts',
    patterns: [
      words(
        '100\\s?% (?:free|gratis)', 'totally free', 'completely free', 'absolutely free', 'free gift',
        'buy one,? get (?:one|two|1|2) free', 'half price', 'clearance', 'everything must go',
        'price (?:crash|drop|slashed)', 'insane (?:deal|discount|prices?)', 'up to \\d{2}\\s?% off',
        // Swedish
        'helt gratis', 'gratis (?:present|gåva)', 'halva priset', 'utförsäljning',
        'allt ska bort', '(?:mega|slut|stor|lager|super|vinter|sommar|black friday[- ]?)?rea', 'prisras', 'galna priser',
        'köp 2 (?:betala|få) (?:för )?1', 'upp till -?\\d{2}\\s?%',
      ),
    ],
    // "70% off", "-60%", "50 % rabatt": 50% or more.
    test: (t) => {
      const re = /(?<![\p{L}\p{N}])-?(\d{2,3})\s?%(?:\s?(off|rabatt|discount|sale|rea|billigare))?/giu;
      for (const m of t.matchAll(re)) {
        const n = Number(m[1]);
        if (n >= 50 && n <= 100 && (m[2] || m[0].startsWith('-'))) return true;
      }
      return false;
    },
  },
  {
    id: 'fear',
    label: 'Fear and alarm',
    patterns: [
      words(
        'warning', 'doctors? (?:hate|are furious|are shocked|warn)', 'silent killer', 'is killing you',
        "before it[’']?s too late", 'stop (?:eating|drinking|using) (?:this|these)', 'never eat', "they don[’']?t want you to know",
        'shocking', 'you could lose', 'your (?:account|computer|phone) (?:is|has been) (?:infected|hacked|at risk)',
        // Swedish
        'varning', 'varnar', 'läkare (?:hatar|varnar|är chockade|rasar)', 'tyst mördare', 'innan det är för sent',
        'sluta (?:äta|dricka|använda) (?:detta|det här|dessa)', 'de vill inte att du ska (?:veta|se)', 'chockerande',
        'du kan förlora',
      ),
    ],
  },
  {
    id: 'scam',
    label: 'Signs of a scam',
    patterns: [
      words(
        'guaranteed (?:returns?|profits?|income)', 'get rich quick', 'passive income', 'double your money',
        `(?:make|earn) ${MONEY}${gap(2)}(?:a|per|every) (?:day|week|hour)`, `${MONEY} (?:a|per) day from home`,
        '(?:crypto|bitcoin|btc|ethereum)(?: trading)? (?:secret|loophole|platform|robot|bot|profits?)',
        `invest(?:ing)? (?:just |only )?${MONEY}`, 'invest in (?:crypto|bitcoin)', 'ai trading',
        "(?:you[’']?ve|you have) won", 'claim your (?:prize|reward|gift)', 'congratulations,? you', 'giveaway winner',
        'free (?:iphone|ipad|gift card|playstation|ps5)', 'secret (?:trading|investment|money) (?:method|trick|app)',
        `(?:${CELEBS})${gap(3)}(?:invest(?:s|ed|ment)?|crypto|bitcoin|reveals?|secret|platform|trading|fortune)`,
        `(?:${CELEBS})${gap(3)}(?:investera(?:r|de)?|avslöjar|hemlighet(?:en)?|förmögenhet)`,
        // Swedish
        'garanterad (?:avkastning|vinst|inkomst)', 'bli rik(?: snabbt)?', 'passiv inkomst', 'dubbla dina pengar',
        `tjäna ${MONEY}${gap(2)}(?:om|per|varje|i) (?:dagen|dag|veckan|vecka|månaden|månad|timmen)`,
        `investera (?:bara |endast |nu |)${MONEY}`, 'investera (?:i |nu i )?(?:krypto|bitcoin)', 'du har vunnit',
        'hämta ut (?:din|ditt) (?:pris|vinst|gåva)', 'grattis,? du har', 'gratis (?:iphone|ipad|presentkort)',
      ),
    ],
  },
  {
    id: 'before_after',
    label: 'Before/after and miracle health claims',
    patterns: [
      words(
        'before (?:and|&|/) after', 'före (?:och|&|/) efter', 'miracle(?: cure| pill| drink)?', 'mirakel\\p{L}*',
        `lose ${NUM}\\s?(?:kg|kilos?|lbs?|pounds)`, `gå ner ${NUM}\\s?(?:kg|kilo)`, `tappa ${NUM}\\s?(?:kg|kilo)`,
        '(?:melts?|burns?) (?:belly|stomach|body) fat', 'smälter (?:bort )?(?:mag|buk)?fett(?:et)?', 'flat belly',
        '(?:cures?|reverses?) (?:diabetes|cancer|arthritis|aging|hair loss|tinnitus|baldness)',
        'bota(?:r|de)? (?:diabetes|cancer|artros|tinnitus|håravfall)', 'reverse aging', 'anti[- ]aging miracle',
        '(?:one|this) (?:weird|simple|strange) trick', 'ett (?:enkelt|konstigt) knep', 'look \\d+ years younger',
        'se \\d+ år yngre ut', 'without (?:diet|dieting|exercise)', 'utan (?:diet|träning|bantning)',
      ),
    ],
  },
  {
    id: 'too_good',
    label: 'Too good to be true',
    patterns: [
      words(
        'too good to be true', "you won[’']?t believe", 'no catch', 'risk[- ]free', '100\\s?% guaranteed', 'zero risk',
        'banks hate', "nothing to lose", 'unbelievable (?:offer|deal|results?)', `(?:for )?(?:only|just) [$€£]\\s?1(?:\\.00)?`,
        'quit your (?:job|9[- ]to[- ]5)', 'work (?:only )?\\d+ (?:minutes|hours?) a day',
        // Swedish
        'för bra för att vara sant', 'du kommer inte (?:att )?tro', 'otroligt men sant', 'riskfri(?:tt|a)?', 'ingen risk',
        '100\\s?% garanti', 'bankerna hatar', 'inget att förlora', 'för (?:bara|endast) 1 (?:kr|krona)', 'säg upp dig',
      ),
    ],
  },
];

function normalise(s: string): string {
  return s.normalize('NFKC').replace(/[‘’`´]/g, '’').replace(/\s+/g, ' ').trim();
}

/** Tactic ids found in one piece of ad text. */
export function tacticsIn(text: string): AdTactic['id'][] {
  const t = normalise(text);
  if (!t) return [];
  return TACTICS.filter((d) => d.patterns.some((p) => p.test(t)) || (d.test?.(t) ?? false)).map((d) => d.id);
}

/** Ads are events with origin 'pushed'. Returns tactics sorted by count, most first. */
export function detectAdTactics(events: ClassifiedEvent[]): AdTactic[] {
  const found = new Map<string, AdTactic>();
  for (const e of events) {
    if (!e || (e.origin !== 'pushed' && e.kind !== 'ad')) continue;
    const title = e.title?.trim();
    const author = e.channel?.name?.trim();
    const text = [title, author].filter(Boolean).join(' — ');
    if (!text) continue;
    const ids = tacticsIn(text);
    for (const id of ids) {
      const def = TACTICS.find((d) => d.id === id)!;
      const cur = found.get(id) ?? { id, label: def.label, count: 0, examples: [] };
      cur.count++;
      const example = title || author!;
      if (cur.examples.length < 3 && !cur.examples.includes(example)) cur.examples.push(example);
      found.set(id, cur);
    }
  }
  const order = TACTICS.map((d) => d.id);
  return [...found.values()].sort((a, b) => b.count - a.count || order.indexOf(a.id) - order.indexOf(b.id));
}
