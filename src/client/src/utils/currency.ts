export interface CurrencyDef {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

export const KNOWN_CURRENCIES: Record<string, CurrencyDef> = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  KHR: { code: 'KHR', name: 'Cambodian Riel', symbol: '៛', decimals: 0 },
  VND: { code: 'VND', name: 'Việt Nam Đồng', symbol: '₫', decimals: 0 }, // i18n-data: built-in currency record
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  THB: { code: 'THB', name: 'Thai Baht', symbol: '฿', decimals: 2 },
  CNY: { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimals: 2 },
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 },
};

export function getCurrencyDecimals(code?: string): number {
  if (!code) return 0;
  const upper = code.trim().toUpperCase();
  if (KNOWN_CURRENCIES[upper]) {
    return KNOWN_CURRENCIES[upper].decimals;
  }
  // Standard zero-decimal currencies
  if (['VND', 'KHR', 'JPY', 'KRW', 'CLP', 'IDR'].includes(upper)) {
    return 0;
  }
  return 2;
}

export function getCurrencySymbol(code?: string): string {
  if (!code) return '';
  const upper = code.trim().toUpperCase();
  return KNOWN_CURRENCIES[upper]?.symbol || upper;
}

export function formatCurrencyValue(amount: number | string | null | undefined, currencyCode = 'USD'): string {
  const num = typeof amount === 'number' ? amount : Number(amount) || 0;
  const upper = (currencyCode || 'USD').trim().toUpperCase();
  const decimals = getCurrencyDecimals(upper);

  if (upper === 'VND' || upper === 'KHR') {
    // Vietnamese & Cambodian dot-separator convention for integers
    const parts = Math.round(num).toString().split('');
    let res = '';
    let count = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      res = parts[i] + res;
      count++;
      if (count % 3 === 0 && i > 0) {
        res = '.' + res;
      }
    }
    return res || '0';
  }

  // Standard international comma-separated with fixed decimals
  const fixed = num.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart ? `${formattedInt}.${decPart}` : formattedInt;
}

export function parseCurrencyInput(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;

  const str = String(value).trim();
  if (!str) return 0;

  // Clean currency symbols and spaces
  let cleaned = str.replace(/[^\d.,-]/g, '');

  // Detect comma vs dot usage
  if (cleaned.includes('.') && cleaned.includes(',')) {
    if (cleaned.lastIndexOf('.') > cleaned.lastIndexOf(',')) {
      // 1,234.56 format
      cleaned = cleaned.replace(/,/g, '');
    } else {
      // 1.234,56 format
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
  } else if (cleaned.includes('.')) {
    // If only dot: check if it's thousands separator (e.g. 15.000.000)
    const dotParts = cleaned.split('.');
    if (dotParts.length > 2 || (dotParts.length === 2 && dotParts[1].length === 3)) {
      cleaned = cleaned.replace(/\./g, '');
    }
  } else if (cleaned.includes(',')) {
    const commaParts = cleaned.split(',');
    if (commaParts.length > 2 || (commaParts.length === 2 && commaParts[1].length === 3)) {
      cleaned = cleaned.replace(/,/g, '');
    } else {
      cleaned = cleaned.replace(',', '.');
    }
  }

  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : result;
}
