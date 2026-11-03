/**
 * Calendar-date helpers. The API speaks zone-less `YYYY-MM-DD` strings, so all
 * arithmetic is done at UTC midnight — local time would shift a day west of
 * Greenwich and skip or repeat one across a DST change.
 */

/** A pre-approval covers at most this many days (end - start). Mirrors the server. */
export const MAX_EVENT_DAYS = 30;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
/** India Standard Time, UTC+05:30. The server's `clock.today()` uses the same zone. */
const IST_OFFSET_MS = 330 * 60_000;

function toUtc(iso: string | null | undefined): Date | null {
  const match = iso ? ISO_DATE.exec(iso) : null;
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  // Rejects 2026-02-30 and friends, which Date.UTC silently rolls over.
  return date.getUTCDate() === Number(d) && date.getUTCMonth() === Number(m) - 1 ? date : null;
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isValidIsoDate(iso: string | null | undefined): boolean {
  return toUtc(iso) !== null;
}

/** The IST calendar date, as the server sees "today". */
export function todayIst(now: Date = new Date()): string {
  return toIso(new Date(now.getTime() + IST_OFFSET_MS));
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  if (!date) return iso;
  return toIso(new Date(date.getTime() + days * DAY_MS));
}

/** Whole days from `from` to `to` (negative when `to` is earlier); NaN if either is invalid. */
export function daysBetween(from: string, to: string): number {
  const a = toUtc(from);
  const b = toUtc(to);
  if (!a || !b) return Number.NaN;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/**
 * Every date of an event, inclusive, in order.
 *
 * Empty when either end is invalid or the event ends before it starts. Capped
 * at MAX_EVENT_DAYS + 1 dates, the longest event the server accepts, so a
 * malformed range can never produce a runaway grid.
 */
export function eventDates(start: string, end: string): string[] {
  const span = daysBetween(start, end);
  if (Number.isNaN(span) || span < 0) return [];
  const count = Math.min(span, MAX_EVENT_DAYS) + 1;
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** The last day either pre-approval signature can be given: the day before the event. */
export function approvalDeadlineFor(eventStartDate: string): string {
  return addDays(eventStartDate, -1);
}

/** "2026-08-17" -> "17/08/2026", the claim sheet template's format. */
export function formatDmy(iso: string | null | undefined): string {
  const date = toUtc(iso);
  if (!date) return iso ?? '';
  const [y, m, d] = toIso(date).split('-');
  return `${d}/${m}/${y}`;
}

// Spelled out rather than Intl: ICU versions disagree ("Sep" vs "Sept").
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayMonth(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

function dayMonthYear(date: Date): string {
  return `${dayMonth(date)} ${date.getUTCFullYear()}`;
}

/** "2026-08-17" -> "17 Aug 2026". Returns the input unchanged if it is not a date. */
export function formatDate(iso: string | null | undefined): string {
  const date = toUtc(iso);
  return date ? dayMonthYear(date) : (iso ?? '');
}

/** "2026-08-17" -> "Mon". */
export function formatWeekday(iso: string | null | undefined): string {
  const date = toUtc(iso);
  return date ? WEEKDAYS[date.getUTCDay()] : '';
}

/**
 * An event's dates, as short as they can be said without ambiguity:
 * "17 Aug 2026", "5 – 6 Aug 2026", "30 Aug – 2 Sep 2026",
 * "30 Dec 2026 – 2 Jan 2027".
 */
export function formatDateRange(start: string, end: string): string {
  const a = toUtc(start);
  const b = toUtc(end);
  if (!a || !b) return [start, end].filter(Boolean).join(' – ');
  if (start === end) return dayMonthYear(a);
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${dayMonthYear(a)} – ${dayMonthYear(b)}`;
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${dayMonth(a)} – ${dayMonthYear(b)}`;
  return `${a.getUTCDate()} – ${dayMonthYear(b)}`;
}

/** 97.78 -> "97.78", 90 -> "90.00", null -> "". The export's attendance format. */
export function formatAttendance(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : value.toFixed(2);
}
