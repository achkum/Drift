// OWNER: parsers agent. Parses the localised date strings in Google Takeout HTML exports.

/** First three letters of month names (en, sv, de, nl, da/no, es/fr/it partially) → month index. */
const MONTHS: Record<string, number> = {
  jan: 0, ene: 0, gen: 0, jän: 0, janv: 0,
  feb: 1, fev: 1, fév: 1, févr: 1,
  mar: 2, mär: 2, maa: 2, mrt: 2,
  apr: 3, abr: 3, avr: 3,
  may: 4, maj: 4, mai: 4, mei: 4, mag: 4,
  jun: 5, juin: 5, giu: 5,
  jul: 6, juil: 6, lug: 6,
  aug: 7, ago: 7, aoû: 7, aou: 7,
  sep: 8, set: 8,
  oct: 9, okt: 9, ott: 9,
  nov: 10,
  dec: 11, dez: 11, dic: 11, déc: 11, des: 11,
};

/** Common time zone abbreviations → offset in minutes east of UTC. */
const ZONES: Record<string, number> = {
  UTC: 0, GMT: 0, Z: 0, WET: 0, WEST: 60, BST: 60, IST: 60,
  CET: 60, CEST: 120, MEZ: 60, MESZ: 120, EET: 120, EEST: 180, MSK: 180,
  EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420,
  AKST: -540, AKDT: -480, HST: -600, AST: -240, ADT: -180, NST: -210, NDT: -150,
  JST: 540, KST: 540, AEST: 600, AEDT: 660, ACST: 570, ACDT: 630, AWST: 480, NZST: 720, NZDT: 780,
};

function monthIndex(name: string): number | undefined {
  const n = name.toLowerCase().replace(/\./g, '');
  for (const len of [4, 3]) {
    const v = MONTHS[n.slice(0, len)];
    if (v !== undefined) return v;
  }
  return undefined;
}

/** Offset in minutes from a zone string like "CET", "GMT+01:00", "UTC-5". undefined = unknown. */
function zoneOffset(zone: string): number | undefined {
  const z = zone.trim().replace(/[()]/g, '');
  if (!z) return undefined;
  const m = /^(?:GMT|UTC)?\s*([+-−])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(z);
  if (m) {
    const sign = m[1] === '+' ? 1 : -1;
    return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
  }
  const abbr = ZONES[z.toUpperCase()];
  return abbr;
}

export interface TakeoutDate {
  iso: string;
  /** False when no recognisable time zone was present and UTC was assumed. */
  zoneKnown: boolean;
}

/**
 * Parse dates such as:
 *   "Mar 1, 2024, 12:34:56 PM CET"      (en, with or without narrow no-break spaces)
 *   "1 mars 2024 12:34:56 CET"           (sv)
 *   "1 mars 2024 kl. 12:34:56 CET"
 *   "01.03.2024, 12:34:56 MEZ"           (de numeric)
 *   "2024-03-01 12:34:56 CET"
 */
export function parseTakeoutDate(raw: string): TakeoutDate | undefined {
  const s = raw
    .replace(/[     ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return undefined;

  let y: number | undefined, mo: number | undefined, d: number | undefined;
  let h = 0, mi = 0, se = 0;
  let ampm: string | undefined;
  let zone = '';

  const time = '(\\d{1,2})[:.](\\d{2})(?:[:.](\\d{2}))?\\s*([AaPp]\\.?\\s?[Mm]\\.?)?\\s*(.*)';
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^(\\d{4})-(\\d{1,2})-(\\d{1,2})[ T,]+${time}$`).exec(s))) {
    y = +m[1]; mo = +m[2] - 1; d = +m[3];
    h = +m[4]; mi = +m[5]; se = +(m[6] ?? 0); ampm = m[7]; zone = m[8];
  } else if ((m = new RegExp(`^(\\d{1,2})[./](\\d{1,2})[./](\\d{4}),?\\s+${time}$`).exec(s))) {
    // Day-first numeric dates (de, sv-FI ...). Ambiguous for en-US, which Takeout writes with month names.
    d = +m[1]; mo = +m[2] - 1; y = +m[3];
    h = +m[4]; mi = +m[5]; se = +(m[6] ?? 0); ampm = m[7]; zone = m[8];
  } else if ((m = new RegExp(`^([^\\s\\d,]+)\\.? (\\d{1,2}),? (\\d{4}),?(?: at| um| kl\\.?)? ${time}$`, 'i').exec(s))) {
    mo = monthIndex(m[1]); d = +m[2]; y = +m[3];
    h = +m[4]; mi = +m[5]; se = +(m[6] ?? 0); ampm = m[7]; zone = m[8];
  } else if ((m = new RegExp(`^(\\d{1,2})\\.? (?:de )?([^\\s\\d,]+)\\.?,? (?:de )?(\\d{4}),?(?: at| um| kl\\.?| à| a las| om)? ${time}$`, 'i').exec(s))) {
    d = +m[1]; mo = monthIndex(m[2]); y = +m[3];
    h = +m[4]; mi = +m[5]; se = +(m[6] ?? 0); ampm = m[7]; zone = m[8];
  } else {
    return undefined;
  }
  if (y === undefined || mo === undefined || d === undefined) return undefined;
  if (ampm) {
    const pm = /^p/i.test(ampm);
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  const offset = zoneOffset(zone);
  const utc = Date.UTC(y, mo, d, h, mi, se) - (offset ?? 0) * 60_000;
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return undefined;
  return { iso: date.toISOString(), zoneKnown: offset !== undefined };
}
