import { store } from '../db/store.ts';
import type { ContractRecord } from '../types.ts';
import { normalizeNumber } from './numberKeys.ts';

export interface ContractRuleError {
  status: 400 | 409;
  error: string;
  code: string;
  params?: Record<string, string>;
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
const day = (v: unknown) => (isDate(v) ? String(v).slice(0, 10) : null);

/** Number used by another contract, including contracts in the trash (never re-issued). */
export function contractNumberTaken(number: string, excludeId?: string): ContractRecord | null {
  const n = normalizeNumber(number);
  if (!n) return null;
  return [...store.getContracts(), ...store.getTrash().contracts].find((c) => c.id !== excludeId && normalizeNumber(c.contract_number) === n) ?? null;
}

/** Checks the contract's milestones: start ≤ end, signing not after the end, liquidation/termination after signing. */
export function checkContractDates(c: Partial<ContractRecord> & Record<string, any>): ContractRuleError | null {
  const signed = day(c.signed_date);
  const start = day(c.start_date);
  const end = day(c.end_date);
  const fail = (fields: string, error: string): ContractRuleError => ({ status: 400, error, code: 'CONTRACT_DATES_INVALID', params: { fields } });
  for (const [field, value] of [
    ['signed_date', c.signed_date],
    ['start_date', c.start_date],
    ['end_date', c.end_date],
  ] as const) {
    if (value && !isDate(value)) return fail(field, `Ngày không hợp lệ (${field}).`);
  }
  if (start && end && end < start) return fail('end_date', 'Ngày kết thúc phải sau ngày bắt đầu hiệu lực.');
  if (signed && end && end < signed) return fail('end_date', 'Ngày kết thúc không thể trước ngày ký.');
  for (const field of ['liquidation_date', 'termination_date']) {
    const d = day(c[field]);
    if (c[field] && !d) return fail(field, `Ngày không hợp lệ (${field}).`);
    if (d && signed && d < signed) return fail(field, 'Ngày thanh lý/chấm dứt không thể trước ngày ký.');
  }
  return null;
}

export interface Appendix {
  id: string;
  appendix_number: string;
  title: string;
  signed_date: string;
  new_end_date?: string | null;
  new_value?: number | null;
  summary?: string | null;
  previous_end_date?: string | null;
  previous_value?: number | null;
  created_at: string;
  created_by: string;
}

/**
 * Converts each active contract's value to the report currency. A currency's `exchange_rate` means
 * "1 unit = exchange_rate units of the default currency" (the one flagged is_default). Totals per
 * currency are always exact; the converted total is reported only when every currency has a rate.
 */
export function contractValueTotals(contracts: ContractRecord[]) {
  const currencies = store.getCurrencies();
  const settings = store.getSettings();
  const report = (settings.report_currency || currencies.find((c) => c.is_default)?.code || 'USD').toUpperCase();
  const base = (currencies.find((c) => c.is_default)?.code || report).toUpperCase();
  const rateToBase = (code: string): number | null => {
    const upper = code.toUpperCase();
    if (upper === base) return 1;
    const cur = currencies.find((c) => c.code.toUpperCase() === upper);
    return cur?.exchange_rate && cur.exchange_rate > 0 ? cur.exchange_rate : null;
  };
  const byCurrency: Record<string, number> = {};
  for (const c of contracts) {
    // A contract without a status (older imports) is in force, as everywhere else
    if ((c.status || 'active') !== 'active') continue;
    const code = (c.currency || base).toUpperCase();
    byCurrency[code] = (byCurrency[code] || 0) + (Number(c.value) || 0);
  }
  const reportRate = rateToBase(report);
  let total = 0;
  const missingRates: string[] = [];
  for (const [code, amount] of Object.entries(byCurrency)) {
    const r = rateToBase(code);
    if (r === null || reportRate === null) missingRates.push(code);
    else total += (amount * r) / reportRate;
  }
  return {
    valueByCurrency: byCurrency,
    reportCurrency: report,
    totalContractValue: missingRates.length === 0 ? Math.round(total * 100) / 100 : null,
    missingExchangeRates: missingRates,
  };
}
