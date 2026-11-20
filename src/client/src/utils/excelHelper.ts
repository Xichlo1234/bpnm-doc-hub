import * as XLSX from 'xlsx';

export interface ExcelColumnMapping<T> {
  header: string;
  key: keyof T | string;
  width?: number;
  format?: (val: any, row: T) => any;
  parse?: (val: any) => any;
}

/**
 * Export data array to an Excel (.xlsx) file and trigger browser download
 */
export function exportToExcel<T>(
  data: T[],
  columns: ExcelColumnMapping<T>[],
  fileName: string,
  sheetName = 'Sheet1'
) {
  const headers = columns.map(c => c.header);

  const rows = data.map(row => {
    return columns.map(col => {
      const rawVal = (row as any)[col.key];
      if (col.format) {
        return col.format(rawVal, row);
      }
      return rawVal === null || rawVal === undefined ? '' : rawVal;
    });
  });

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Set column widths
  worksheet['!cols'] = columns.map(c => ({
    wch: c.width || Math.max(c.header.length + 4, 12),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const safeFileName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(workbook, safeFileName);
}

/**
 * Read uploaded Excel file (.xlsx or .csv) and return array of objects
 */
export async function readExcelFile(file: File): Promise<any[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) return [];

  // Parse as json array of objects using first row as headers
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  return jsonData;
}

/**
 * Generate a template Excel file with predefined headers and sample row
 */
export function downloadExcelTemplate(
  columns: Array<{ header: string; sample?: string; width?: number }>,
  fileName: string
) {
  const headers = columns.map(c => c.header);
  const sampleRow = columns.map(c => c.sample || '');

  const worksheet = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  worksheet['!cols'] = columns.map(c => ({
    wch: c.width || Math.max(c.header.length + 4, 15),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
  XLSX.writeFile(workbook, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}
