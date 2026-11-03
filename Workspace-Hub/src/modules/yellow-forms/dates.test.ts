import { describe, it, expect } from 'vitest';

import {
  MAX_EVENT_DAYS,
  addDays,
  approvalDeadlineFor,
  daysBetween,
  eventDates,
  formatAttendance,
  formatDate,
  formatDateRange,
  formatDmy,
  formatWeekday,
  isValidIsoDate,
  todayIst,
} from './dates';

describe('yellow-form date helpers', () => {
  it('enumerates every event date inclusively', () => {
    expect(eventDates('2026-08-05', '2026-08-06')).toEqual(['2026-08-05', '2026-08-06']);
    expect(eventDates('2026-08-17', '2026-08-17')).toEqual(['2026-08-17']);
  });

  it('crosses month and year boundaries', () => {
    expect(eventDates('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02',
    ]);
    expect(eventDates('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
  });

  it('returns nothing for a backwards or malformed range', () => {
    expect(eventDates('2026-08-06', '2026-08-05')).toEqual([]);
    expect(eventDates('not-a-date', '2026-08-05')).toEqual([]);
    expect(eventDates('2026-02-30', '2026-03-02')).toEqual([]);
  });

  it('never enumerates more than the longest event the server accepts', () => {
    expect(eventDates('2026-01-01', '2026-12-31')).toHaveLength(MAX_EVENT_DAYS + 1);
  });

  it('does day arithmetic by calendar date', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-08-05', '2026-08-17')).toBe(12);
    expect(daysBetween('2026-08-17', '2026-08-05')).toBe(-12);
    expect(approvalDeadlineFor('2026-10-01')).toBe('2026-09-30');
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
  });

  it('reads today in India Standard Time, as the server does', () => {
    // 20:00 UTC is already 01:30 the next day in IST.
    expect(todayIst(new Date('2026-09-27T20:00:00Z'))).toBe('2026-09-28');
    expect(todayIst(new Date('2026-09-27T18:29:00Z'))).toBe('2026-09-27');
  });

  it('formats dates the way the claim sheet template and the UI say them', () => {
    expect(formatDmy('2026-08-17')).toBe('17/08/2026');
    expect(formatDate('2026-08-17')).toBe('17 Aug 2026');
    expect(formatDate(null)).toBe('');
    expect(formatWeekday('2026-08-17')).toBe('Mon');
    expect(formatDateRange('2026-08-17', '2026-08-17')).toBe('17 Aug 2026');
    expect(formatDateRange('2026-08-05', '2026-08-06')).toBe('5 – 6 Aug 2026');
    expect(formatDateRange('2026-08-30', '2026-09-02')).toBe('30 Aug – 2 Sep 2026');
    expect(formatDateRange('2026-12-30', '2027-01-02')).toBe('30 Dec 2026 – 2 Jan 2027');
  });

  it('formats attendance with two decimals, blank when missing', () => {
    expect(formatAttendance(97.78)).toBe('97.78');
    expect(formatAttendance(90)).toBe('90.00');
    expect(formatAttendance(null)).toBe('');
  });
});
