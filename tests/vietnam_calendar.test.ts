import { describe, expect, it } from 'vitest';
import { readVietnamDate, shiftCalendarDay, vietnameseHolidays, vietnameseLunarDate } from '../src/client/src/utils/vietnamCalendar.ts';

describe('Vietnamese calendars', () => {
  it('rolls over on Vietnam midnight even when UTC is on the preceding day', () => {
    expect(readVietnamDate(new Date('2026-02-16T16:59:59Z'))).toEqual({ year: 2026, month: 2, day: 16 });
    const tet = readVietnamDate(new Date('2026-02-16T17:00:00Z'));
    expect(tet).toEqual({ year: 2026, month: 2, day: 17 });
    expect(vietnameseLunarDate(tet)).toEqual({ year: 2026, month: 1, day: 1, leap: false });
    expect(vietnameseHolidays(tet)).toEqual(['calendarTet']);
  });

  it('uses Vietnamese lunar dates when a neighbouring time zone can differ', () => {
    expect(vietnameseLunarDate({ year: 2007, month: 2, day: 17 })).toEqual({ year: 2007, month: 1, day: 1, leap: false });
  });

  it('matches the fixed solar dates and the movable Vietnamese festivals', () => {
    expect(vietnameseHolidays({ year: 2026, month: 2, day: 16 })).toEqual(['calendarTetEve']);
    expect(vietnameseHolidays({ year: 2026, month: 4, day: 26 })).toEqual(['calendarHungKings']);
    expect(vietnameseHolidays({ year: 2026, month: 9, day: 25 })).toEqual(['calendarMidAutumn']);
    expect(vietnameseHolidays({ year: 2026, month: 9, day: 2 })).toEqual(['calendarNationalDay']);
    expect(vietnameseHolidays({ year: 2026, month: 11, day: 20 })).toEqual(['calendarTeachersDay']);
    expect(vietnameseHolidays({ year: 2026, month: 11, day: 21 })).toEqual([]);
  });

  it('shows a leap month without repeating a lunar festival', () => {
    const date = { year: 1993, month: 5, day: 1 };
    expect(vietnameseLunarDate(date)).toEqual({ year: 1993, month: 3, day: 10, leap: true });
    expect(vietnameseHolidays(date)).toEqual(['calendarLabourDay']);
  });

  it('moves through Gregorian leap days and year boundaries', () => {
    expect(shiftCalendarDay({ year: 2028, month: 3, day: 1 }, -1)).toEqual({ year: 2028, month: 2, day: 29 });
    expect(shiftCalendarDay({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
  });
});
