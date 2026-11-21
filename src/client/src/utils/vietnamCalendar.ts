import { getLunarDate } from '@dqcai/vn-lunar';
import type { TranslationKey } from '../i18n/index.ts';

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

export interface LunarCivilDate extends CivilDate {
  leap: boolean;
}

export const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
// January of the library's first year can require lunar data from the previous year.
export const MIN_CALENDAR_YEAR = 1201;
export const MAX_CALENDAR_YEAR = 2199;

const dayInVietnam = new Intl.DateTimeFormat('en-CA', {
  calendar: 'gregory', numberingSystem: 'latn', timeZone: VIETNAM_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
});

export const toUtcDate = ({ year, month, day }: CivilDate) => new Date(Date.UTC(year, month - 1, day));

export function readVietnamDate(instant: Date): CivilDate {
  const parts = dayInVietnam.formatToParts(instant);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
}

export const civilDateKey = ({ year, month, day }: CivilDate) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export function shiftCalendarDay({ year, month, day }: CivilDate, offset: number): CivilDate {
  const date = toUtcDate({ year, month, day: day + offset });
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function vietnameseLunarDate({ year, month, day }: CivilDate): LunarCivilDate | null {
  if (year < MIN_CALENDAR_YEAR || year > MAX_CALENDAR_YEAR) return null;
  const lunar = getLunarDate(day, month, year);
  return lunar.day ? { day: lunar.day, month: lunar.month, year: lunar.year, leap: lunar.leap } : null;
}

const SOLAR_HOLIDAYS: Record<string, TranslationKey> = {
  '1-1': 'calendarNewYear',
  '3-8': 'calendarInternationalWomen',
  '4-30': 'calendarReunification',
  '5-1': 'calendarLabourDay',
  '6-1': 'calendarChildrensDay',
  '9-2': 'calendarNationalDay',
  '10-20': 'calendarVietnamWomen',
  '11-20': 'calendarTeachersDay',
  '12-25': 'calendarChristmas',
};

export function vietnameseHolidays(date: CivilDate, lunar = vietnameseLunarDate(date)): TranslationKey[] {
  const solar = SOLAR_HOLIDAYS[`${date.month}-${date.day}`];
  const result: TranslationKey[] = solar ? [solar] : [];
  if (!lunar || lunar.leap) return result;

  if (lunar.month === 1 && lunar.day <= 3) result.push('calendarTet');
  if (lunar.month === 3 && lunar.day === 10) result.push('calendarHungKings');
  if (lunar.month === 8 && lunar.day === 15) result.push('calendarMidAutumn');
  if (lunar.month === 12 && lunar.day >= 29) {
    const tomorrow = vietnameseLunarDate(shiftCalendarDay(date, 1));
    if (tomorrow?.month === 1 && tomorrow.day === 1) result.push('calendarTetEve');
  }
  return result;
}
