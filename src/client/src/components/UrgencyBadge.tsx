import React from 'react';
import type { UrgencyInfo } from '../../../server/types.ts';
import { useLanguage } from '../context/LanguageContext.tsx';
import { contractUrgencyLabel } from '../i18n/index.ts';

interface UrgencyBadgeProps {
  urgency?: UrgencyInfo;
  className?: string;
}

export const UrgencyBadge: React.FC<UrgencyBadgeProps> = ({ urgency, className = '' }) => {
  const { t } = useLanguage();
  if (!urgency) return null;

  const { level, badgeType } = urgency;
  const displayLabel = contractUrgencyLabel(t, urgency);

  return (
    <span className={`urgency-badge ${badgeType} ${className}`} title={displayLabel}>
      {(level === 'urgent' || level === 'warning' || level === 'active') && (
        <span className={`badge-dot ${badgeType}`} />
      )}
      {displayLabel}
    </span>
  );
};

