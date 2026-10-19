// Hand-labelled English + Swedish titles for comparing the keyword and ML classifiers.
// Mostly written WITHOUT the obvious keywords from analysis/topics.ts, since that is
// where the keyword classifier struggles. 'other' = no clear topic.
export interface LabelledItem {
  title?: string;
  channel?: string;
  query?: string;
  topic: string;
  lang: 'en' | 'sv';
}

export const LABELLED: LabelledItem[] = [
  // politics
  { title: 'Who will form the next cabinet after Sunday\'s vote count', topic: 'politics', lang: 'en' },
  { title: 'Senators clash over the spending bill in heated hearing', topic: 'politics', lang: 'en' },
  { title: 'Oppositionen kräver att ministern avgår efter skandalen', topic: 'politics', lang: 'sv' },
  { title: 'Så påverkar de nya reglerna för uppehållstillstånd', topic: 'politics', lang: 'sv' },
  // football
  { title: 'Stoppage-time winner sends the Gunners top of the table', topic: 'football', lang: 'en' },
  { title: 'Every Mo Salah strike from this campaign', topic: 'football', lang: 'en' },
  { title: 'Blåvitt vände och vann borta mot Norrköping', topic: 'football', lang: 'sv' },
  { title: 'Straffdrama när landslaget gick vidare', topic: 'football', lang: 'sv' },
  // sports
  { title: 'Overtime thriller as the Oilers force game seven', topic: 'sports', lang: 'en' },
  { title: 'Fastest lap ever at Monza, pole position battle', topic: 'sports', lang: 'en' },
  { title: 'Frölunda tog guld efter förlängning', topic: 'sports', lang: 'sv' },
  { title: 'Ebba Andersson spurtade hem segern i femmilen', topic: 'sports', lang: 'sv' },
  // fitness
  { title: 'I did 100 burpees every day for 30 days', topic: 'fitness', lang: 'en' },
  { title: 'Grow bigger arms with these 4 movements', topic: 'fitness', lang: 'en' },
  { title: 'Mitt bästa tips för att springa milen under 45 minuter', topic: 'fitness', lang: 'sv' },
  { title: 'Rygg och biceps, ett komplett pass', topic: 'fitness', lang: 'sv' },
  // dieting
  { title: 'Down 15 pounds in two months, here is what changed', topic: 'dieting', lang: 'en' },
  { title: 'The GLP-1 shot changed my appetite completely', topic: 'dieting', lang: 'en' },
  { title: 'Minus tio kilo utan att räkna något', topic: 'dieting', lang: 'sv' },
  // food
  { title: 'The creamiest carbonara you will ever make', topic: 'food', lang: 'en' },
  { title: 'Trying every item on the menu at a Tokyo izakaya', topic: 'food', lang: 'en' },
  { title: 'Krämig kycklinggryta med curry och ris', topic: 'food', lang: 'sv' },
  { title: 'Saftig sockerkaka som mormor gjorde den', topic: 'food', lang: 'sv' },
  // gaming
  { title: 'Clutch 1v4 to win the final round', topic: 'gaming', lang: 'en' },
  { title: 'I survived 100 days in hardcore', topic: 'gaming', lang: 'en' },
  { title: 'Vi klarade sista bossen till slut', topic: 'gaming', lang: 'sv' },
  // music
  { title: 'Midnight Rain (Live from the Eras stage)', topic: 'music', lang: 'en' },
  { title: 'Learning the solo from Hotel California by ear', topic: 'music', lang: 'en' },
  { title: 'Hela publiken sjöng med i refrängen', topic: 'music', lang: 'sv' },
  { title: 'Ny singel ute nu, lyssna', topic: 'music', lang: 'sv' },
  // tech
  { title: 'Is the M4 chip worth the upgrade?', topic: 'tech', lang: 'en' },
  { title: 'I replaced my phone\'s battery myself', topic: 'tech', lang: 'en' },
  { title: 'Bästa trådlösa lurarna under tusen kronor', topic: 'tech', lang: 'sv' },
  { title: 'Så installerar du om Windows från början', topic: 'tech', lang: 'sv' },
  // science
  { title: 'Why the Moon is slowly drifting away from Earth', topic: 'science', lang: 'en' },
  { title: 'The strange behaviour of light at absolute zero', topic: 'science', lang: 'en' },
  { title: 'Därför är himlen blå', topic: 'science', lang: 'sv' },
  // finance
  { title: 'Should you pay off the house early or buy index funds?', topic: 'finance', lang: 'en' },
  { title: 'How I retired at 40 on a teacher\'s salary', topic: 'finance', lang: 'en' },
  { title: 'Riksbanken sänker igen, vad betyder det för dig', topic: 'finance', lang: 'sv' },
  // beauty
  { title: 'Five minute no-foundation glowy look', topic: 'beauty', lang: 'en' },
  { title: 'Autumn capsule wardrobe on a budget', topic: 'beauty', lang: 'en' },
  { title: 'Min kvällsrutin för torr hy', topic: 'beauty', lang: 'sv' },
  // travel
  { title: '48 hours in Lisbon on a budget', topic: 'travel', lang: 'en' },
  { title: 'Overnight sleeper train from Stockholm to Narvik', topic: 'travel', lang: 'en' },
  { title: 'Tre veckor i Vietnam med ryggsäck', topic: 'travel', lang: 'sv' },
  // comedy
  { title: 'When your mom finds your report card', topic: 'comedy', lang: 'en' },
  { title: 'Hidden camera: the talking vending machine', topic: 'comedy', lang: 'en' },
  { title: 'Svenskar när det blir 20 grader varmt', topic: 'comedy', lang: 'sv' },
  // film_tv
  { title: 'Every easter egg you missed in the finale', topic: 'film_tv', lang: 'en' },
  { title: 'Ranking all of Christopher Nolan\'s work', topic: 'film_tv', lang: 'en' },
  { title: 'Bröllopet, hela första avsnittet av säsong två', topic: 'film_tv', lang: 'sv' },
  // education
  { title: 'The fall of Constantinople in 12 minutes', topic: 'education', lang: 'en' },
  { title: 'Spanish for travellers: 50 phrases you need', topic: 'education', lang: 'en' },
  { title: 'Så pluggar du effektivt inför högskoleprovet', topic: 'education', lang: 'sv' },
  // cars
  { title: 'Our cheap BMW E30 project finally runs', topic: 'cars', lang: 'en' },
  { title: 'The 911 GT3 RS on track at full send', topic: 'cars', lang: 'en' },
  { title: 'Byter kamrem på Volvon själv', topic: 'cars', lang: 'sv' },
  // family
  { title: 'Telling our toddler she is getting a baby brother', topic: 'family', lang: 'en' },
  { title: 'Första dagen på förskolan för lillebror', topic: 'family', lang: 'sv' },
  // health
  { title: 'What nobody tells you about burnout recovery', topic: 'health', lang: 'en' },
  { title: 'Signs your thyroid might be off', topic: 'health', lang: 'en' },
  { title: 'Hur jag tog mig ur min utmattningsdepression', topic: 'health', lang: 'sv' },
  // religion
  { title: 'Psalm 23 reflection for a hard week', topic: 'religion', lang: 'en' },
  { title: 'Vad händer under fastemånaden', topic: 'religion', lang: 'sv' },
  // relationships
  { title: 'He texted me after three months of silence', topic: 'relationships', lang: 'en' },
  { title: 'Hur vet man att man är kär på riktigt', topic: 'relationships', lang: 'sv' },
  // true_crime
  { title: 'The night the Lindbergh baby vanished', topic: 'true_crime', lang: 'en' },
  { title: 'Gärningsmannen greps efter tolv år', topic: 'true_crime', lang: 'sv' },
  // lifestyle
  { title: 'Slow Sunday reset: laundry, candles and a good book', topic: 'lifestyle', lang: 'en' },
  { title: 'Hemma hos mig, höstpyssel och tända ljus', topic: 'lifestyle', lang: 'sv' },
  // kids
  { title: 'Wheels on the bus and more sing-alongs', topic: 'kids', lang: 'en' },
  { title: 'Bamse och tjuvstaden, hela filmen', topic: 'kids', lang: 'sv' },
  // animals
  { title: 'Golden retriever meets a baby goat', topic: 'animals', lang: 'en' },
  { title: 'Älgen som vägrade flytta på sig', topic: 'animals', lang: 'sv' },
  // other: no clear topic
  { title: 'Q&A: answering your questions', topic: 'other', lang: 'en' },
  { title: 'Sorry for being gone so long', topic: 'other', lang: 'en' },
  { title: 'Lite uppdateringar', topic: 'other', lang: 'sv' },
];

/** Written after tuning DEFAULT_TUNING on LABELLED; never used for tuning. */
export const HELD_OUT: LabelledItem[] = [
  { title: 'Ministers walk out of the budget talks', topic: 'politics', lang: 'en' },
  { title: 'Väljarna straffade regeringspartiet i mätningen', topic: 'politics', lang: 'sv' },
  { title: 'Late equaliser at Anfield keeps the title race alive', topic: 'football', lang: 'en' },
  { title: 'Landslagets nya förbundskapten tar ut truppen', topic: 'football', lang: 'sv' },
  { title: 'Swedish skier takes gold in the slalom', topic: 'sports', lang: 'en' },
  { title: 'My 12 week program to add 20 kg to my squat', topic: 'fitness', lang: 'en' },
  { title: 'Snabb pastasås med tomat och basilika', topic: 'food', lang: 'sv' },
  { title: 'This boss took me 40 attempts', topic: 'gaming', lang: 'en' },
  { title: 'Hon sjunger Ängel i natt på Allsång', topic: 'music', lang: 'sv' },
  { title: 'The folding phone that finally got it right', topic: 'tech', lang: 'en' },
  { title: 'Varför har vi årstider?', topic: 'science', lang: 'sv' },
  { title: 'Ska du amortera eller spara i fonder?', topic: 'finance', lang: 'sv' },
  { title: 'Drugstore dupes for luxury lipsticks', topic: 'beauty', lang: 'en' },
  { title: 'Vi tog tåget genom Alperna till Venedig', topic: 'travel', lang: 'sv' },
  { title: 'My dad tries to use TikTok for the first time', topic: 'comedy', lang: 'en' },
  { title: 'Every Pixar opening scene ranked', topic: 'film_tv', lang: 'en' },
  { title: 'Varför föll Romarriket?', topic: 'education', lang: 'sv' },
  { title: 'Restoring a rusty Saab 900 turbo', topic: 'cars', lang: 'en' },
  { title: 'Vår förlossningsberättelse', topic: 'family', lang: 'sv' },
  { title: 'Living with chronic fatigue for ten years', topic: 'health', lang: 'en' },
  { title: 'Om förlåtelse, söndagens predikan', topic: 'religion', lang: 'sv' },
  { title: 'Our first year of marriage, honestly', topic: 'relationships', lang: 'en' },
  { title: 'Den försvunna flickan i Malmö', topic: 'true_crime', lang: 'sv' },
  { title: 'Reset my whole apartment with me', topic: 'lifestyle', lang: 'en' },
  { title: 'Five little ducks went out one day', topic: 'kids', lang: 'en' },
  { title: 'Rescue kitten sees snow for the first time', topic: 'animals', lang: 'en' },
];
