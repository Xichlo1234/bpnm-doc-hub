import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.tsx';
import type { Translations } from '../i18n/index.ts';
import {
  MAX_CALENDAR_YEAR, MIN_CALENDAR_YEAR, VIETNAM_TIME_ZONE, civilDateKey, readVietnamDate,
  shiftCalendarDay, toUtcDate, vietnameseHolidays, vietnameseLunarDate,
  type CivilDate, type LunarCivilDate,
} from '../utils/vietnamCalendar.ts';

const LOCALES = { vi: 'vi-VN', en: 'en-GB', km: 'km-KH' };
const KEY_OFFSETS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

function formatLunar(date: LunarCivilDate | null, t: Translations, digits: Intl.NumberFormat, withYear = false) {
  if (!date) return t.calendarNotAvailable;
  const parts = withYear ? [date.day, date.month, date.year] : [date.day, date.month];
  const formatted = parts.map((number) => digits.format(number)).join('/');
  return date.leap ? `${formatted} · ${t.calendarLeapMonth}` : formatted;
}

const CalendarDialog = memo(function CalendarDialog({ today, onClose }: { today: CivilDate; onClose: () => void }) {
  const { t, language } = useLanguage();
  const locale = LOCALES[language];
  const [selected, setSelected] = useState(today);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectedButton = useRef<HTMLButtonElement>(null);
  const restoreDayFocus = useRef(false);
  const titleId = useId();
  const monthId = useId();
  const { year, month } = selected;
  const selectedKey = civilDateKey(selected);
  const todayKey = civilDateKey(today);

  const format = useMemo(() => ({
    day: new Intl.DateTimeFormat(locale, { timeZone: 'UTC', calendar: 'gregory', dateStyle: 'full' }),
    month: new Intl.DateTimeFormat(locale, { timeZone: 'UTC', calendar: 'gregory', month: 'long', year: 'numeric' }),
    weekday: new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short' }),
    number: new Intl.NumberFormat(locale, { useGrouping: false }),
  }), [locale]);

  const cells = useMemo(() => {
    const first = { year, month, day: 1 };
    const leading = (toUtcDate(first).getUTCDay() + 6) % 7;
    const days = toUtcDate({ year, month: month + 1, day: 0 }).getUTCDate();
    const length = Math.ceil((leading + days) / 7) * 7;
    return Array.from({ length }, (_, index) => {
      const date = shiftCalendarDay(first, index - leading);
      const lunar = vietnameseLunarDate(date);
      return { date, lunar, holidays: vietnameseHolidays(date, lunar) };
    });
  }, [year, month]);

  const selectedCell = cells.find(({ date }) => civilDateKey(date) === selectedKey);
  const canSelectDay = (date: CivilDate) => date.year >= MIN_CALENDAR_YEAR && date.year <= MAX_CALENDAR_YEAR;

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    selectedButton.current?.focus();
  }, []);

  useEffect(() => {
    if (restoreDayFocus.current) {
      restoreDayFocus.current = false;
      selectedButton.current?.focus();
    }
  }, [selected]);

  const changeMonth = (offset: number) => {
    const date = shiftCalendarDay({ year, month: month + offset, day: 1 }, 0);
    if (canSelectDay(date)) setSelected(date);
  };

  return (
    <dialog ref={dialogRef} className="calendar-dialog" aria-labelledby={titleId} onClose={onClose}>
      <header className="calendar-dialog-header">
        <h2 id={titleId}><CalendarDays size={19} aria-hidden="true" />{t.calendarTitle}</h2>
        <button type="button" className="calendar-icon-button" onClick={() => dialogRef.current?.close()} aria-label={t.close}>
          <X size={19} aria-hidden="true" />
        </button>
      </header>

      <div className="calendar-controls">
        <button type="button" className="calendar-icon-button" aria-label={t.calendarPreviousMonth} onClick={() => changeMonth(-1)} disabled={year === MIN_CALENDAR_YEAR && month === 1}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h3 id={monthId} aria-live="polite">{format.month.format(toUtcDate({ year, month, day: 1 }))}</h3>
        <button type="button" className="calendar-icon-button" aria-label={t.calendarNextMonth} onClick={() => changeMonth(1)} disabled={year === MAX_CALENDAR_YEAR && month === 12}>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="calendar-weekdays" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => <span key={index}>{format.weekday.format(new Date(Date.UTC(2024, 0, index + 1)))}</span>)}
      </div>
      <div className="calendar-days" role="group" aria-labelledby={monthId} onKeyDown={(event) => {
        const offset = KEY_OFFSETS[event.key];
        if (offset === undefined) return;
        event.preventDefault();
        const next = shiftCalendarDay(selected, offset);
        if (!canSelectDay(next)) return;
        restoreDayFocus.current = true;
        setSelected(next);
      }}>
        {cells.map(({ date, lunar, holidays }) => {
          const key = civilDateKey(date);
          const isSelected = key === selectedKey;
          const isToday = key === todayKey;
          const label = [format.day.format(toUtcDate(date)), `${t.calendarLunarDate} ${formatLunar(lunar, t, format.number)}`, ...holidays.map((holiday) => t[holiday])].join(' · ');
          return (
            <button
              key={key}
              ref={isSelected ? selectedButton : undefined}
              type="button"
              className={`calendar-day${date.month !== month ? ' calendar-day-outside' : ''}${holidays.length ? ' calendar-day-holiday' : ''}`}
              aria-label={label}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              tabIndex={isSelected ? 0 : -1}
              disabled={!canSelectDay(date)}
              onClick={() => setSelected(date)}
            >
              <strong>{format.number.format(date.day)}</strong>
              <span>{lunar ? `${format.number.format(lunar.day)}${lunar.day === 1 ? `/${format.number.format(lunar.month)}` : ''}` : '—'}</span>
            </button>
          );
        })}
      </div>

      <footer className="calendar-detail">
        <div>
          <strong>{format.day.format(toUtcDate(selected))}</strong>
          <span>{t.calendarLunarDate} {formatLunar(selectedCell?.lunar ?? null, t, format.number, true)}</span>
          {selectedCell?.holidays.map((holiday) => <p key={holiday}><Sparkles size={14} aria-hidden="true" />{t[holiday]}</p>)}
        </div>
        <button type="button" className="calendar-today-button" onClick={() => setSelected(today)}>{t.calendarToday}</button>
      </footer>
    </dialog>
  );
});

export function WorkspaceCalendar() {
  const { t, tf, language } = useLanguage();
  const [now, setNow] = useState(() => new Date());
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeCalendar = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const locale = LOCALES[language];
  const format = useMemo(() => ({
    date: new Intl.DateTimeFormat(locale, { timeZone: VIETNAM_TIME_ZONE, calendar: 'gregory', dateStyle: 'full' }),
    time: new Intl.DateTimeFormat(locale, { timeZone: VIETNAM_TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }),
    number: new Intl.NumberFormat(locale, { useGrouping: false }),
  }), [locale]);
  const { year, month, day } = readVietnamDate(now);
  const today = useMemo(() => ({ year, month, day }), [year, month, day]);
  const lunar = useMemo(() => vietnameseLunarDate(today), [today]);
  const holidays = useMemo(() => vietnameseHolidays(today, lunar), [today, lunar]);
  const solarLabel = format.date.format(now);

  return (
    <div className="workspace-calendar">
      <div className="workspace-calendar-line">
        <button type="button" className="workspace-calendar-trigger" ref={triggerRef} onClick={() => setIsOpen(true)} aria-haspopup="dialog" aria-expanded={isOpen} aria-label={`${t.calendarOpen} · ${solarLabel}`}>
          <CalendarDays size={16} aria-hidden="true" />
          <span>{solarLabel}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <time className="workspace-clock" dateTime={now.toISOString()} title={t.calendarVietnamTime}>{format.time.format(now)}</time>
        <span className="workspace-lunar">{t.calendarLunarDate} {formatLunar(lunar, t, format.number)}</span>
      </div>
      {holidays.map((holiday) => (
        <div key={holiday} className="workspace-holiday"><Sparkles size={16} aria-hidden="true" />{tf('calendarGreeting', { holiday: t[holiday] })}</div>
      ))}
      {isOpen && <CalendarDialog today={today} onClose={closeCalendar} />}
    </div>
  );
}
