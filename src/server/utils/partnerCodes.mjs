/** @param {unknown} value */
export function normalizePartnerCode(value) {
  return String(value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase().normalize('NFC');
}
