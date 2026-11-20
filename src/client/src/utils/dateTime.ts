/**
 * Unified Date & Time Formatter for DocHub
 * Converts UTC ISO / SQLite timestamps to Vietnam Local Time (Asia/Ho_Chi_Minh, UTC+7)
 */

export function parseSystemDate(raw?: string | null): Date | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Date-only string YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  }

  // SQLite UTC timestamp without timezone indicator: "YYYY-MM-DD HH:MM:SS"
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(trimmed)) {
    const isoUtc = trimmed.replace(' ', 'T') + 'Z';
    const d = new Date(isoUtc);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats notification timestamp in Asia/Ho_Chi_Minh (GMT+7)
 * Example: "2026-10-26T07:11:00.000Z" -> "26/10 14:11"
 * Date-only: "2026-03-21" -> "21/03/2026"
 */
export function formatNotificationTime(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // If date-only string YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-');
    return `${d}/${m}/${y}`;
  }

  const date = parseSystemDate(trimmed);
  if (!date) return trimmed;

  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const day = parts.find(p => p.type === 'day')?.value || '';
    const month = parts.find(p => p.type === 'month')?.value || '';
    const hour = parts.find(p => p.type === 'hour')?.value || '';
    const minute = parts.find(p => p.type === 'minute')?.value || '';

    return `${day}/${month} ${hour}:${minute}`;
  } catch {
    // Fallback manual UTC+7 calculation
    const vnTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const day = String(vnTime.getUTCDate()).padStart(2, '0');
    const month = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
    const hour = String(vnTime.getUTCHours()).padStart(2, '0');
    const minute = String(vnTime.getUTCMinutes()).padStart(2, '0');
    return `${day}/${month} ${hour}:${minute}`;
  }
}

/**
 * Formats full timestamp in Asia/Ho_Chi_Minh (GMT+7) for Audit Logs & User Records
 * Example: "2026-10-26T07:11:25.000Z" -> "26/10/2026 14:11:25"
 */
export function formatSystemDateTime(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '—';
  const trimmed = raw.trim();
  if (!trimmed) return '—';

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-');
    return `${d}/${m}/${y}`;
  }

  const date = parseSystemDate(trimmed);
  if (!date) return trimmed;

  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const day = parts.find(p => p.type === 'day')?.value || '';
    const month = parts.find(p => p.type === 'month')?.value || '';
    const year = parts.find(p => p.type === 'year')?.value || '';
    const hour = parts.find(p => p.type === 'hour')?.value || '';
    const minute = parts.find(p => p.type === 'minute')?.value || '';
    const second = parts.find(p => p.type === 'second')?.value || '';

    return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
  } catch {
    const vnTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const day = String(vnTime.getUTCDate()).padStart(2, '0');
    const month = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
    const year = vnTime.getUTCFullYear();
    const hour = String(vnTime.getUTCHours()).padStart(2, '0');
    const minute = String(vnTime.getUTCMinutes()).padStart(2, '0');
    const second = String(vnTime.getUTCSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
  }
}
