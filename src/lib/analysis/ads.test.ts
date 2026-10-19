import { describe, expect, it } from 'vitest';
import type { ClassifiedEvent, Origin } from '@/lib/types';
import { detectAdTactics, tacticsIn } from './ads';

let n = 0;
function ad(title: string | undefined, opts: { origin?: Origin; author?: string; kind?: ClassifiedEvent['kind'] } = {}): ClassifiedEvent {
  n++;
  return {
    id: `ad-${n}`,
    platform: 'youtube',
    kind: opts.kind ?? 'ad',
    time: `2024-03-${String((n % 28) + 1).padStart(2, '0')}T12:00:00Z`,
    title,
    channel: opts.author ? { name: opts.author } : undefined,
    topic: 'other',
    topicConfidence: 0,
    origin: opts.origin ?? 'pushed',
    originReason: 'an ad',
  };
}

describe('tacticsIn', () => {
  const cases: [string, string][] = [
    // fake urgency
    ['Last chance! Summer sale ends tonight', 'fake_urgency'],
    ['Only today: new sneakers drop', 'fake_urgency'],
    ['Hurry, only 3 left in stock', 'fake_urgency'],
    ['Sista chansen – handla innan midnatt', 'fake_urgency'],
    ['Endast idag: fri frakt på allt', 'fake_urgency'],
    ['Erbjudandet slutar ikväll', 'fake_urgency'],
    ['Missa inte vårens nyheter', 'fake_urgency'],
    // discounts
    ['Up to 70% off everything', 'fake_discount'],
    ['Jackets -60%', 'fake_discount'],
    ['80 % rabatt på hela sortimentet', 'fake_discount'],
    ['Stor REA på Åhléns', 'fake_discount'],
    ['Helt gratis – testa nu', 'fake_discount'],
    ['100% FREE starter kit', 'fake_discount'],
    // fear
    ['WARNING: this common food is killing you', 'fear'],
    ['Doctors hate this one weird trick', 'fear'],
    ['Varning! Ät aldrig detta efter 40', 'fear'],
    ['Läkare varnar: sluta äta detta', 'fear'],
    // scams
    ['Elon Musk reveals new crypto platform', 'scam'],
    ['Guaranteed returns with AI trading', 'scam'],
    ['Make $500 a day from home', 'scam'],
    ['Congratulations, you have won a free iPhone 15', 'scam'],
    ['Investera 2 500 kr och tjäna 30 000 kr i månaden', 'scam'],
    ['Skavlan avslöjar hemligheten bakom hans förmögenhet', 'scam'],
    ['Garanterad avkastning varje vecka', 'scam'],
    ['Du har vunnit! Hämta ut din vinst', 'scam'],
    // health
    ['Before and after: 30 days on this drink', 'before_after'],
    ['Lose 10 kg in 2 weeks without dieting', 'before_after'],
    ['Före och efter – se resultaten', 'before_after'],
    ['Mirakelkur för ledvärk', 'before_after'],
    ['Gå ner 5 kilo på en vecka', 'before_after'],
    // too good
    ["You won't believe what this app pays", 'too_good'],
    ['Risk-free, no catch, 100% guaranteed', 'too_good'],
    ['För bra för att vara sant? Riskfritt i 30 dagar', 'too_good'],
  ];
  it.each(cases)('%s → %s', (text, id) => {
    expect(tacticsIn(text)).toContain(id);
  });

  const negatives = [
    'Free shipping on orders over $50',
    'Try Spotify Premium free for 1 month',
    'Get started for free',
    'Prova gratis i 30 dagar',
    'Invest in your future with a pension savings account',
    'Investera i fonder med låga avgifter',
    'Area 51 documentary',
    'Gratis frakt över 499 kr',
    'Free Willy – trailer',
    '10% off your first order',
    'Spara 20% på vinterjackor',
    'Realme 12 Pro review', // "rea" inside a word
    'Freedom of speech podcast',
    'Varningstriangel till bilen', // the compound word, not "Varning!"
    'Before Sunrise (1995) trailer',
    'Elon Musk biography audiobook',
    'Last of Us part II',
    'Miraculous: Tales of Ladybug',
  ];
  it.each(negatives)('does not flag "%s"', (text) => {
    expect(tacticsIn(text)).toEqual([]);
  });
});

describe('detectAdTactics', () => {
  it('counts ads per tactic, keeps up to 3 distinct examples and sorts by count', () => {
    const events = [
      ad('Last chance: ends tonight'),
      ad('Last chance: ends tonight'),
      ad('Sista chansen!'),
      ad('Only today!'),
      ad('Hurry up'),
      ad('Up to 70% off'),
      ad('Mega-REA nu'),
      ad('Warning: doctors hate this'),
      ad('Cosy knitwear for autumn'),
    ];
    const out = detectAdTactics(events);
    expect(out.map((t) => t.id)).toEqual(['fake_urgency', 'fake_discount', 'fear']);
    const urgency = out[0];
    expect(urgency.count).toBe(5);
    expect(urgency.label).toBe('Fake urgency');
    expect(urgency.examples).toEqual(['Last chance: ends tonight', 'Sista chansen!', 'Only today!']);
    expect(out[1].count).toBe(2);
  });

  it('only looks at ads', () => {
    const out = detectAdTactics([
      ad('Last chance to see the comet', { origin: 'served', kind: 'watch' }),
      ad('WARNING: scary movie trailer', { origin: 'chosen', kind: 'watch' }),
      ad('Last chance!', { origin: 'pushed', kind: 'watch' }),
    ]);
    expect(out).toEqual([{ id: 'fake_urgency', label: 'Fake urgency', count: 1, examples: ['Last chance!'] }]);
  });

  it('uses the advertiser name when an ad has no title (Instagram)', () => {
    const out = detectAdTactics([ad(undefined, { author: 'Bitcoin Profit Platform' }), ad(undefined, { author: 'IKEA' }), ad(undefined)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'scam', count: 1, examples: ['Bitcoin Profit Platform'] });
  });

  it('returns [] for no ads', () => {
    expect(detectAdTactics([])).toEqual([]);
  });
});
