import { formatMessage } from './format.ts';
import { statusLabel } from './statusLabels.ts';
import type { Translations } from './vi.ts';

/**
 * The server computes contract urgency / document deadlines and also sends a Vietnamese `label`.
 * The UI rebuilds the text from `level` and `daysRemaining` instead; `label` is only the fallback
 * for a level this file does not know yet.
 */
interface DeadlineInfo {
  level: string;
  label?: string;
  daysRemaining?: number | null;
}

const days = (info: DeadlineInfo) => Math.abs(info.daysRemaining ?? 0);

export function contractUrgencyLabel(t: Translations, info?: DeadlineInfo | null): string {
  if (!info) return '';
  switch (info.level) {
    case 'liquidated':
      return t.statusLiquidated;
    case 'terminated':
      return t.statusTerminated;
    case 'indefinite':
      return t.indefiniteTerm;
    case 'expired':
      return formatMessage(t.overdueDaysFormat, { days: days(info) });
    case 'urgent':
    case 'warning':
    case 'notice':
    case 'active':
      return formatMessage(t.daysLeftFormat, { days: days(info) });
    default:
      return info.label ?? '';
  }
}

export function documentDeadlineLabel(t: Translations, info?: DeadlineInfo | null): string {
  if (!info) return '';
  const hasDays = typeof info.daysRemaining === 'number';
  switch (info.level) {
    case 'completed':
      return t.statusCompleted;
    case 'completed_late':
      return t.statusCompletedLate;
    case 'sent':
      return t.statusDispatched;
    case 'archived':
      return t.wfStage_archived;
    case 'cancelled':
      return t.statusCancelled;
    case 'signing':
      return t.statusPendingSignature;
    case 'pending_send':
      return t.statusSignedAwaitingDispatch;
    case 'draft':
      return t.statusDraft;
    case 'unassigned':
      return t.statusUnassigned;
    case 'overdue':
      return formatMessage(t.overdueDaysFormat, { days: days(info) });
    case 'urgent':
      return hasDays ? formatMessage(t.daysLeftUrgentFormat, { days: days(info) }) : statusLabel(t, info.label);
    case 'warning':
    case 'processing':
      // Without a due date the server puts the record's own status in `label`.
      return hasDays ? formatMessage(t.daysLeftFormat, { days: days(info) }) : statusLabel(t, info.label) || t.statusInProgress;
    default:
      return statusLabel(t, info.label);
  }
}
