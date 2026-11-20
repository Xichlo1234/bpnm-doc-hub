import type { UrgencyInfo, UrgencyLevel, BadgeType } from '../types.ts';

export function parseYMD(dateStr: string): number {
  if (!dateStr) return 0;
  const cleaned = dateStr.trim();
  if (cleaned.includes('-')) {
    const parts = cleaned.split('-').map(Number);
    if (parts.length === 3) {
      if (parts[0] > 1000) {
        // YYYY-MM-DD
        return Date.UTC(parts[0], parts[1] - 1, parts[2]);
      } else {
        // DD-MM-YYYY
        return Date.UTC(parts[2], parts[1] - 1, parts[0]);
      }
    }
  } else if (cleaned.includes('/')) {
    const parts = cleaned.split('/').map(Number);
    if (parts.length === 3) {
      if (parts[2] > 1000) {
        // M/D/YYYY or D/M/YYYY. If parts[0] > 12, it is D/M/YYYY, otherwise M/D/YYYY
        const month = parts[0] > 12 ? parts[1] : parts[0];
        const day = parts[0] > 12 ? parts[0] : parts[1];
        return Date.UTC(parts[2], month - 1, day);
      } else if (parts[0] > 1000) {
        // YYYY/M/D
        return Date.UTC(parts[0], parts[1] - 1, parts[2]);
      }
    }
  }
  const parsed = Date.parse(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export function getTodayString(): string {
  const now = new Date();
  // Adjust to UTC+7 (Vietnam Time)
  const vnOffset = 7 * 60; // in minutes
  const localMinutes = now.getTimezoneOffset();
  const vnTime = new Date(now.getTime() + (vnOffset + localMinutes) * 60 * 1000);
  
  const y = vnTime.getFullYear();
  const m = String(vnTime.getMonth() + 1).padStart(2, '0');
  const d = String(vnTime.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function calculateUrgency(
  endDate: string | null | undefined,
  status: string,
  todayStr?: string
): UrgencyInfo {
  if (status === 'liquidated') {
    return {
      level: 'liquidated',
      label: 'Đã thanh lý',
      daysRemaining: null,
      badgeType: 'gray',
      color: '#71717A',
    };
  }

  if (status === 'terminated') {
    return {
      level: 'terminated',
      label: 'Đã chấm dứt',
      daysRemaining: null,
      badgeType: 'gray',
      color: '#52525B',
    };
  }

  if (!endDate || endDate.trim() === '') {
    return {
      level: 'indefinite',
      label: 'Vô thời hạn',
      daysRemaining: null,
      badgeType: 'info',
      color: '#2563EB',
    };
  }

  const today = todayStr || getTodayString();
  const targetMs = parseYMD(endDate);
  const todayMs = parseYMD(today);

  const diffMs = targetMs - todayMs;
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0) {
    const absDays = Math.abs(days);
    return {
      level: 'expired',
      label: `Quá hạn ${absDays} ngày`,
      daysRemaining: days,
      badgeType: 'danger',
      color: '#BE123C',
    };
  }

  if (days <= 7) {
    return {
      level: 'urgent',
      label: `Còn ${days} ngày`,
      daysRemaining: days,
      badgeType: 'urgent',
      color: '#F43F5E',
    };
  }

  if (days <= 15) {
    return {
      level: 'warning',
      label: `Còn ${days} ngày`,
      daysRemaining: days,
      badgeType: 'warning',
      color: '#EA580C',
    };
  }

  if (days <= 30) {
    return {
      level: 'notice',
      label: `Còn ${days} ngày`,
      daysRemaining: days,
      badgeType: 'notice',
      color: '#D97706',
    };
  }

  return {
    level: 'active',
    label: `Còn ${days} ngày`,
    daysRemaining: days,
    badgeType: 'success',
    color: '#059669',
  };
}

export function calculateDocumentDeadline(
  doc: {
    doc_type: string;
    due_date?: string | null;
    completed_date?: string | null;
    status?: string | null;
  },
  todayStr?: string
): {
  level: string;
  label: string;
  daysRemaining: number | null;
  badgeType: BadgeType;
  color: string;
} {
  const status = (doc.status || '').trim();

  // Completed incoming doc
  if (status === 'Hoàn thành' || doc.completed_date) {
    if (doc.due_date && doc.completed_date && doc.completed_date > doc.due_date) {
      return {
        level: 'completed_late',
        label: 'Hoàn thành (Trễ hạn)',
        daysRemaining: null,
        badgeType: 'warning',
        color: '#EA580C',
      };
    }
    return {
      level: 'completed',
      label: 'Hoàn thành',
      daysRemaining: null,
      badgeType: 'success',
      color: '#059669',
    };
  }

  // Outgoing doc statuses
  if (status === 'Đã gửi') {
    return {
      level: 'sent',
      label: 'Đã gửi',
      daysRemaining: null,
      badgeType: 'success',
      color: '#059669',
    };
  }
  if (status === 'Trình ký') {
    return {
      level: 'signing',
      label: 'Trình ký',
      daysRemaining: null,
      badgeType: 'warning',
      color: '#EA580C',
    };
  }
  if (status === 'Đã ký - chờ gửi') {
    return {
      level: 'pending_send',
      label: 'Đã ký - chờ gửi',
      daysRemaining: null,
      badgeType: 'info',
      color: '#0284C7',
    };
  }
  if (status === 'Dự thảo') {
    return {
      level: 'draft',
      label: 'Dự thảo',
      daysRemaining: null,
      badgeType: 'gray',
      color: '#71717A',
    };
  }

  // Unassigned
  if (status === 'Chưa phân công') {
    return {
      level: 'unassigned',
      label: 'Chưa phân công',
      daysRemaining: null,
      badgeType: 'gray',
      color: '#71717A',
    };
  }

  // Calculate based on due_date if available
  if (doc.due_date && doc.due_date.trim() !== '') {
    const today = todayStr || getTodayString();
    const targetMs = parseYMD(doc.due_date);
    const todayMs = parseYMD(today);
    const diffMs = targetMs - todayMs;
    const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (days < 0) {
      const absDays = Math.abs(days);
      return {
        level: 'overdue',
        label: `Quá hạn ${absDays} ngày`,
        daysRemaining: days,
        badgeType: 'danger',
        color: '#BE123C',
      };
    }

    if (days <= 3) {
      return {
        level: 'urgent',
        label: `Còn ${days} ngày (Gấp)`,
        daysRemaining: days,
        badgeType: 'urgent',
        color: '#F43F5E',
      };
    }

    if (days <= 7) {
      return {
        level: 'warning',
        label: `Còn ${days} ngày`,
        daysRemaining: days,
        badgeType: 'warning',
        color: '#EA580C',
      };
    }

    return {
      level: 'processing',
      label: `Còn ${days} ngày`,
      daysRemaining: days,
      badgeType: 'info',
      color: '#2563EB',
    };
  }

  return {
    level: 'processing',
    label: status || 'Đang xử lý',
    daysRemaining: null,
    badgeType: 'info',
    color: '#2563EB',
  };
}

