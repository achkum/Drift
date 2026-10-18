// Text helpers shared by the classifier and origin labelling. Dependency-free.

const MARKS = /\p{M}+/gu;
const NON_WORD = /[^\p{L}\p{N}]+/u;

/** Lowercase and strip diacritics: "Träning På Gym" -> "traning pa gym". */
export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(MARKS, '');
}

/** Normalised word tokens. */
export function tokenize(s: string | undefined): string[] {
  if (!s) return [];
  const out: string[] = [];
  for (const t of normalize(s).split(NON_WORD)) if (t) out.push(t);
  return out;
}

/** Common English and Swedish words that say nothing about a topic. */
export const STOPWORDS = new Set(
  (
    'the a an and or of to in on at for with by from is are was be it this that these those how what why when who ' +
    'which my your our me you we i he she they his her its not no yes do does did can will just about vs vs. ' +
    'new best top video videos official full part ep episode live shorts short watch more most all into out up ' +
    'och att det som en ett hur vad varfor nar vem var ar i pa med for av till om den de jag du vi han hon inte ' +
    'ja nej har kan ska sa men eller fran mitt min din dina mina sin sitt nya basta del avsnitt'
  ).split(' '),
);

/** Tokens worth comparing between a search and a video (no stopwords, 3+ chars or digits). */
export function contentTokens(s: string | undefined): string[] {
  return tokenize(s).filter((t) => !STOPWORDS.has(t) && (t.length >= 3 || /^\d+$/.test(t)));
}

/** Loose token match: equal, or one is a prefix of the other (shorter at least 4 chars). */
export function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 4 && l.startsWith(s);
}

/** Canonical key for a channel or profile URL: no protocol, www, query or trailing slash. */
export function urlKey(u: string | undefined): string | undefined {
  if (!u) return undefined;
  const k = normalize(u.trim())
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^(www\.|m\.)/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  return k || undefined;
}

/** Canonical key for a channel name. */
export function nameKey(n: string | undefined): string | undefined {
  if (!n) return undefined;
  const k = tokenize(n.replace(/^@/, '')).join(' ');
  return k || undefined;
}
