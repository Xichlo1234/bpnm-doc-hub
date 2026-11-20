import type { TranslationKey, Translations } from './vi.ts';

/**
 * Status values are stored (and compared) as Vietnamese strings. Translate only for display:
 * known values map to a dictionary key; anything user-defined is shown as stored.
 */
export const STATUS_KEYS: Record<string, TranslationKey> = {
  'Dự thảo': 'statusDraft',
  'Trình duyệt': 'statusSubmittedForApproval',
  'Đã ký': 'statusSigned',
  'Đang thực hiện': 'statusInExecution',
  'Tạm dừng': 'statusSuspended',
  'Thanh lý': 'statusLiquidation',
  'Hủy': 'statusCancelled',
  'Trình ký': 'statusPendingSignature',
  'Đã ký - chờ gửi': 'statusSignedAwaitingDispatch',
  'Đã gửi': 'statusDispatched',
  'Đang xử lý': 'statusInProgress',
  'Chưa phân công': 'statusUnassigned',
  'Hoàn thành': 'statusCompleted',
  'Hoàn thành (Trễ hạn)': 'statusCompletedLate',
  'Còn hiệu lực': 'statusInEffect',
  'Đã thanh lý': 'statusLiquidated',
  'Đã chấm dứt': 'statusTerminated',
};

export function statusLabel(t: Translations, value?: string | null): string {
  if (!value) return '';
  const key = STATUS_KEYS[value.trim()];
  return key ? t[key] : value;
}

/** Urgency levels are stored as Vietnamese strings too; same display-only mapping as statuses. */
export const URGENCY_KEYS: Record<string, TranslationKey> = {
  'Thường': 'urgencyNormal',
  'Khẩn': 'urgencyUrgent',
  'Thượng khẩn': 'urgencyVeryUrgent',
  'Hỏa tốc': 'urgencyFlash',
};

export function urgencyLabel(t: Translations, value?: string | null): string {
  if (!value) return '';
  const key = URGENCY_KEYS[value.trim()];
  return key ? t[key] : value;
}
