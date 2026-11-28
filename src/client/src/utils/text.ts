export function normalizeVietnamese(str: string): string {
  if (!str) return '';
  return stripVietnameseAccents(str.toLowerCase());
}

export function stripVietnameseAccents(str: string): string {
  return str.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}
