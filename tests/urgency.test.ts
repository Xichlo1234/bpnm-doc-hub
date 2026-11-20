import { describe, it, expect } from 'vitest';
import { calculateUrgency, calculateDocumentDeadline } from '../src/server/utils/urgency.ts';

describe('calculateUrgency', () => {
  const TODAY = '2026-10-23';

  it('should return liquidated for liquidated contracts regardless of end_date', () => {
    const result = calculateUrgency('2026-10-20', 'liquidated', TODAY);
    expect(result.level).toBe('liquidated');
    expect(result.label).toBe('Đã thanh lý');
    expect(result.badgeType).toBe('gray');
  });

  it('should return terminated for terminated contracts', () => {
    const result = calculateUrgency('2026-11-20', 'terminated', TODAY);
    expect(result.level).toBe('terminated');
    expect(result.label).toBe('Đã chấm dứt');
  });

  it('should return indefinite for contracts without end date', () => {
    const result = calculateUrgency(null, 'active', TODAY);
    expect(result.level).toBe('indefinite');
    expect(result.label).toBe('Vô thời hạn');
    expect(result.daysRemaining).toBeNull();
  });

  it('should return expired when end_date is in the past', () => {
    const result = calculateUrgency('2026-10-21', 'active', TODAY);
    expect(result.level).toBe('expired');
    expect(result.daysRemaining).toBe(-2);
    expect(result.label).toBe('Quá hạn 2 ngày');
    expect(result.badgeType).toBe('danger');
  });

  it('should return urgent when end_date is within 7 days', () => {
    const result = calculateUrgency('2026-10-26', 'active', TODAY);
    expect(result.level).toBe('urgent');
    expect(result.daysRemaining).toBe(3);
    expect(result.label).toBe('Còn 3 ngày');
    expect(result.badgeType).toBe('urgent');
  });

  it('should return warning when end_date is within 8-15 days', () => {
    const result = calculateUrgency('2026-11-04', 'active', TODAY);
    expect(result.level).toBe('warning');
    expect(result.daysRemaining).toBe(12);
    expect(result.label).toBe('Còn 12 ngày');
    expect(result.badgeType).toBe('warning');
  });

  it('should return notice when end_date is within 16-30 days', () => {
    const result = calculateUrgency('2026-11-17', 'active', TODAY);
    expect(result.level).toBe('notice');
    expect(result.daysRemaining).toBe(25);
    expect(result.label).toBe('Còn 25 ngày');
    expect(result.badgeType).toBe('notice');
  });

  it('should return active when end_date is more than 30 days away', () => {
    const result = calculateUrgency('2027-01-21', 'active', TODAY);
    expect(result.level).toBe('active');
    expect(result.daysRemaining).toBe(90);
    expect(result.label).toBe('Còn 90 ngày');
    expect(result.badgeType).toBe('success');
  });
});

describe('calculateDocumentDeadline', () => {
  const TODAY = '2026-10-23';

  it('should return completed for finished documents', () => {
    const result = calculateDocumentDeadline(
      { doc_type: 'incoming', due_date: '2026-09-25', completed_date: '2026-09-22', status: 'Hoàn thành' },
      TODAY
    );
    expect(result.level).toBe('completed');
    expect(result.label).toBe('Hoàn thành');
    expect(result.badgeType).toBe('success');
  });

  it('should return completed_late when completed after due_date', () => {
    const result = calculateDocumentDeadline(
      { doc_type: 'incoming', due_date: '2026-10-01', completed_date: '2026-10-03', status: 'Hoàn thành' },
      TODAY
    );
    expect(result.level).toBe('completed_late');
    expect(result.label).toBe('Hoàn thành (Trễ hạn)');
    expect(result.badgeType).toBe('warning');
  });

  it('should return overdue when due_date is in past and document is not completed', () => {
    const result = calculateDocumentDeadline(
      { doc_type: 'incoming', due_date: '2026-10-20', status: 'Quá hạn' },
      TODAY
    );
    expect(result.level).toBe('overdue');
    expect(result.label).toBe('Quá hạn 3 ngày');
    expect(result.badgeType).toBe('danger');
  });

  it('should return urgent when due_date is within 3 days', () => {
    const result = calculateDocumentDeadline(
      { doc_type: 'incoming', due_date: '2026-10-25', status: 'Đang xử lý' },
      TODAY
    );
    expect(result.level).toBe('urgent');
    expect(result.label).toBe('Còn 2 ngày (Gấp)');
    expect(result.badgeType).toBe('urgent');
  });

  it('should return sent for outgoing sent documents', () => {
    const result = calculateDocumentDeadline(
      { doc_type: 'outgoing', status: 'Đã gửi' },
      TODAY
    );
    expect(result.level).toBe('sent');
    expect(result.label).toBe('Đã gửi');
    expect(result.badgeType).toBe('success');
  });
});

