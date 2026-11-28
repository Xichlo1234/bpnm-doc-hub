import type { DocumentRecord } from '../../../server/types.ts';
import { stripVietnameseAccents } from './text.ts';

export interface CodeFields {
  date: string;
  department: string;
  type: string;
  number: string;
  summary: string;
}
export function composeCode(fields: CodeFields) {
  const { date, department, type } = fields;
  const number = stripVietnameseAccents(fields.number.trim());
  const summary = stripVietnameseAccents(fields.summary.trim()).replace(/\s+/g, ' ');
  const parsed = new Date(date + 'T00:00:00Z');
  const validDate =
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().startsWith(date);
  const warnings: ('date' | 'digit' | 'version' | 'filename')[] = [];
  const name = number + ' ' + summary;
  if (!validDate) warnings.push('date');
  if (/(?:^|[^a-z0-9])(?:draft|final|ban[\s_-]+nhap)(?=$|[^a-z0-9])/i.test(name)) warnings.push('version');
  if (/(?:^|[^a-z0-9])\d(?=$|[^a-z0-9])/i.test(name)) warnings.push('digit');
  if (/[<>:"/\\|?*]/.test(name)) warnings.push('filename');
  const prefix = [date.replaceAll('-', ''), 'SGII', department, type].join('_');
  const code =
    validDate && department && type && summary ? [prefix, number, summary].filter(Boolean).join('_') : '';
  return { code, prefix, warnings };
}

export function suggestSuffix(
  fields: CodeFields,
  records: DocumentRecord[],
  departmentLabel: string,
  typeLabel: string
) {
  const prefix = composeCode(fields).prefix.toLowerCase() + '_';
  const used = new Set<number>();
  for (const record of records) {
    const codes = [record.document_number, record.original_doc_number, record.title, record.file_name].filter(
      (s): s is string => !!s && s.toLowerCase().startsWith(prefix)
    );
    const sameGroup =
      record.issue_date?.slice(0, 10) === fields.date &&
      [fields.department, departmentLabel, fields.department + ' - ' + departmentLabel].includes(
        record.department ?? ''
      ) &&
      [fields.type, typeLabel].includes(record.doc_category ?? '');
    if (codes.length || sameGroup) used.add(0);
    for (const code of codes) {
      const match = code.match(/_(\d{2,})(?:\.[^.]+)?$/);
      if (match) used.add(Number(match[1]));
    }
  }
  if (!used.size) return '';
  let next = 1;
  while (used.has(next)) next++;
  return '_' + String(next).padStart(2, '0');
}
