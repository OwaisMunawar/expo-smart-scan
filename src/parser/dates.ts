export type DateOrder = 'MDY' | 'DMY';

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

// Full alternatives rather than `mar[a-z]*`, otherwise "12 Market 2026" parses as a date.
const MONTH_NAME =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\b\\.?';

const ISO = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/;
const NUMERIC = /\b(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})\b/;
const DAY_MONTH_NAME = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]*${MONTH_NAME}[\\s,-]*(\\d{4}|\\d{2})\\b`,
  'i'
);
const MONTH_NAME_DAY = new RegExp(
  `\\b${MONTH_NAME}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4}|\\d{2})\\b`,
  'i'
);

function expandYear(year: string): number {
  const n = Number(year);
  return year.length === 2 ? 2000 + n : n;
}

function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990 || year > 2100) {
    return null;
  }
  // Round-trip through Date.UTC to reject impossible days like 31/02.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Extracts the first plausible calendar date from a line and returns it as `YYYY-MM-DD`.
 *
 * Ambiguous numeric dates such as `03/04/2026` follow `order`. Dot-separated dates
 * (`03.04.2026`) are treated as day-first because that notation is almost exclusively
 * European, and any component above 12 settles the question on its own.
 */
export function parseDate(line: string, order: DateOrder = 'MDY'): string | null {
  let m = ISO.exec(line);
  if (m) {
    return toIso(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  m = NUMERIC.exec(line);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[3]);
    const year = expandYear(m[4]!);
    let dayFirst = order === 'DMY' || m[2] === '.';
    if (a > 12) dayFirst = true;
    else if (b > 12) dayFirst = false;
    return dayFirst ? toIso(year, b, a) : toIso(year, a, b);
  }

  m = DAY_MONTH_NAME.exec(line);
  if (m) {
    return toIso(expandYear(m[3]!), MONTHS[m[2]!.slice(0, 3).toLowerCase()]!, Number(m[1]));
  }

  m = MONTH_NAME_DAY.exec(line);
  if (m) {
    return toIso(expandYear(m[3]!), MONTHS[m[1]!.slice(0, 3).toLowerCase()]!, Number(m[2]));
  }

  return null;
}
