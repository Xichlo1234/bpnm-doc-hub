import { describe, expect, it } from 'vitest';
import { composeCode, suggestSuffix } from '../src/client/src/utils/guideCode';
import type { DocumentRecord } from '../src/server/types';
const sample = {
  date: '2025-06-20',
  department: 'ENV',
  type: 'EIA',
  number: '123',
  summary: 'BC ĐTM bản phê duyệt lại',
};
describe('Mã tài liệu V3', () => {
  it('ghép đúng ví dụ slide 14 và 15', () => {
    expect(
      composeCode({
        date: '2025-03-15',
        department: 'LEG',
        type: 'PER',
        number: '123xxx',
        summary: 'GP khai thác KS',
      }).code
    ).toBe('20250315_SGII_LEG_PER_123xxx_GP khai thac KS');
    expect(composeCode(sample).code).toBe('20250620_SGII_ENV_EIA_123_BC DTM ban phe duyet lai');
    expect(composeCode({ ...sample, number: '' }).code).toContain('_EIA_BC');
  });
  it.each(['Draft', 'Bản nháp', 'BC_FINAL'])('cảnh báo %s', (summary) => {
    expect(composeCode({ ...sample, summary }).warnings).toContain('version');
  });
  it('kiểm tra ngày và số có một chữ số', () => {
    expect(composeCode({ ...sample, date: '2025-02-30', number: '7' })).toMatchObject({
      code: '',
      warnings: ['date', 'digit'],
    });
  });
  it('đối chiếu bộ ba và hậu tố hiện có', () => {
    const doc = {
      issue_date: sample.date,
      department: 'Môi trường',
      doc_category: 'Báo cáo ĐTM',
    } as DocumentRecord;
    const suffix = (docs: DocumentRecord[]) => suggestSuffix(sample, docs, 'Môi trường', 'Báo cáo ĐTM');
    expect(suffix([])).toBe('');
    expect(suffix([doc])).toBe('_01');
    expect(suffix([doc, { ...doc, file_name: composeCode(sample).code + '_01.pdf' }])).toBe('_02');
    expect(suffix([{ ...doc, issue_date: '2025-06-21' }])).toBe('');
  });
});
