import { describe, it, expect } from 'vitest';
import { formatCurrencyValue, parseCurrencyInput, getCurrencyDecimals } from '../src/client/src/utils/currency.ts';

describe('Currency Utility', () => {
  it('formats VND and KHR with zero decimals and thousand separators', () => {
    expect(formatCurrencyValue(15000000, 'VND')).toBe('15.000.000');
    expect(formatCurrencyValue(2400000, 'KHR')).toBe('2.400.000');
    expect(formatCurrencyValue(0, 'VND')).toBe('0');
  });

  it('formats USD, EUR, AUD with 2 decimals when appropriate or standard formatting', () => {
    const usdFormatted = formatCurrencyValue(12500.5, 'USD');
    expect(usdFormatted).toContain('12,500.50');

    const usdInteger = formatCurrencyValue(5000, 'USD');
    expect(usdInteger).toContain('5,000.00');
  });

  it('correctly reports decimals for standard ISO currencies', () => {
    expect(getCurrencyDecimals('USD')).toBe(2);
    expect(getCurrencyDecimals('EUR')).toBe(2);
    expect(getCurrencyDecimals('VND')).toBe(0);
    expect(getCurrencyDecimals('KHR')).toBe(0);
    expect(getCurrencyDecimals('JPY')).toBe(0);
  });

  it('parses formatted input string into numeric value', () => {
    expect(parseCurrencyInput('15,000,000')).toBe(15000000);
    expect(parseCurrencyInput('15.000.000')).toBe(15000000);
    expect(parseCurrencyInput('$1,250.75')).toBe(1250.75);
    expect(parseCurrencyInput('')).toBe(0);
  });
});
