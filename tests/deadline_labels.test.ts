import { describe, it, expect } from 'vitest';
import { calculateUrgency, calculateDocumentDeadline } from '../src/server/utils/urgency.ts';
import { translations, contractUrgencyLabel, documentDeadlineLabel } from '../src/client/src/i18n/index.ts';

const TODAY = '2026-10-23';
const VIETNAMESE_CHARS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹáàãéèíìĩóòõúùũý]/i;

// One case per level the server can produce.
const contractCases = [
  calculateUrgency('2026-10-20', 'liquidated', TODAY),
  calculateUrgency('2026-10-20', 'terminated', TODAY),
  calculateUrgency(null, 'active', TODAY),
  calculateUrgency('2026-10-01', 'active', TODAY),
  calculateUrgency('2026-10-26', 'active', TODAY),
  calculateUrgency('2026-11-05', 'active', TODAY),
  calculateUrgency('2026-11-15', 'active', TODAY),
  calculateUrgency('2027-06-01', 'active', TODAY),
];

const documentCases = [
  calculateDocumentDeadline({ doc_type: 'incoming', status: 'Hoàn thành', due_date: '2026-10-30', completed_date: '2026-10-20' }, TODAY),
  calculateDocumentDeadline({ doc_type: 'incoming', status: 'Hoàn thành', due_date: '2026-10-10', completed_date: '2026-10-20' }, TODAY),
  calculateDocumentDeadline({ doc_type: 'outgoing', status: 'Đã gửi' }, TODAY),
  calculateDocumentDeadline({ doc_type: 'outgoing', status: 'Trình ký' }, TODAY),
  calculateDocumentDeadline({ doc_type: 'outgoing', status: 'Đã ký - chờ gửi' }, TODAY),
  calculateDocumentDeadline({ doc_type: 'outgoing', status: 'Dự thảo' }, TODAY),
  calculateDocumentDeadline({ doc_type: 'incoming', status: 'Chưa phân công' }, TODAY),
  calculateDocumentDeadline({ doc_type: 'incoming', status: 'Đang xử lý', due_date: '2026-10-01' }, TODAY),
  calculateDocumentDeadline({ doc_type: 'incoming', status: 'Đang xử lý', due_date: '2026-10-25' }, TODAY),
  calculateDocumentDeadline({ doc_type: 'incoming', status: 'Đang xử lý', due_date: '2026-10-29' }, TODAY),
  calculateDocumentDeadline({ doc_type: 'incoming', status: 'Đang xử lý', due_date: '2026-12-01' }, TODAY),
  calculateDocumentDeadline({ doc_type: 'incoming', status: 'Đang xử lý' }, TODAY),
];

describe('client-side deadline labels', () => {
  it('covers every server level', () => {
    expect(new Set(contractCases.map((c) => c.level)).size).toBe(8);
    expect(new Set(documentCases.map((c) => c.level)).size).toBe(11);
  });

  it('matches the server label exactly in Vietnamese', () => {
    for (const info of contractCases) expect(contractUrgencyLabel(translations.vi, info), info.level).toBe(info.label);
    for (const info of documentCases) expect(documentDeadlineLabel(translations.vi, info), info.level).toBe(info.label);
  });

  it('has no Vietnamese in English and Khmer', () => {
    for (const lang of ['en', 'km'] as const) {
      for (const info of contractCases) {
        const text = contractUrgencyLabel(translations[lang], info);
        expect(text, `${lang} ${info.level}`).toBeTruthy();
        expect(VIETNAMESE_CHARS.test(text), `${lang} ${info.level}: ${text}`).toBe(false);
      }
      for (const info of documentCases) {
        const text = documentDeadlineLabel(translations[lang], info);
        expect(text, `${lang} ${info.level}`).toBeTruthy();
        expect(VIETNAMESE_CHARS.test(text), `${lang} ${info.level}: ${text}`).toBe(false);
      }
    }
  });

  it('falls back to the server label for unknown levels', () => {
    expect(contractUrgencyLabel(translations.en, { level: 'future_level', label: 'X' })).toBe('X');
    expect(contractUrgencyLabel(translations.en, null)).toBe('');
  });
});
