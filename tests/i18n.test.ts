import { describe, it, expect } from 'vitest';
import {
  translations,
  formatMessage,
  translate,
  statusLabel,
  seedLabel,
  STATUS_KEYS,
  SEED_LABELS,
  LANGUAGES,
  type Language,
} from '../src/client/src/i18n/index.ts';

// Keys whose value is legitimately the same in English and Khmer (brand names, codes).
const KM_SAME_AS_EN_ALLOWLIST = new Set(['brandTitle']);

// Document-number codes that are written in Vietnamese in every language (e.g. "QĐ" = decision).
const DOCUMENT_CODES = /(?<!\p{L})QĐ(?!\p{L})/gu;

const VIETNAMESE_CHARS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹáàãéèíìĩóòõúùũý]/i;

const placeholders = (s: string) => (s.match(/\{\w+\}/g) || []).sort();

describe('i18n Multi-language Dictionary', () => {
  it('supports vi, en, and km languages with identical key structures', () => {
    const viKeys = Object.keys(translations.vi).sort();
    const enKeys = Object.keys(translations.en).sort();
    const kmKeys = Object.keys(translations.km).sort();

    expect(viKeys.length).toBeGreaterThanOrEqual(40);
    expect(enKeys).toEqual(viKeys);
    expect(kmKeys).toEqual(viKeys);
  });

  it('contains non-empty translated strings in all languages', () => {
    const langs: Language[] = ['vi', 'en', 'km'];
    for (const lang of langs) {
      const dict = translations[lang] as Record<string, string>;
      for (const [key, val] of Object.entries(dict)) {
        expect(val, `Missing or empty string for [${lang}][${key}]`).toBeTruthy();
        expect(typeof val).toBe('string');
      }
    }
  });

  it('contains Khmer specific characters in km translation', () => {
    const kmDict = translations.km;
    expect(kmDict.docTable).toContain('សៀវភៅ');
    expect(kmDict.contractTable).toContain('កិច្ចសន្យា');
  });

  it('does not silently reuse English text as Khmer', () => {
    const copied = Object.keys(translations.km).filter(
      (key) =>
        !KM_SAME_AS_EN_ALLOWLIST.has(key) &&
        translations.km[key as keyof typeof translations.km] === translations.en[key as keyof typeof translations.en]
    );
    expect(copied, 'km values identical to en (translate them or allowlist)').toEqual([]);
  });

  it('keeps Vietnamese text out of the en and km dictionaries', () => {
    const leaked: string[] = [];
    for (const lang of ['en', 'km'] as const) {
      for (const [key, val] of Object.entries(translations[lang])) {
        if (VIETNAMESE_CHARS.test(val.replace(DOCUMENT_CODES, ''))) leaked.push(`${lang}.${key}`);
      }
    }
    expect(leaked).toEqual([]);
  });

  it('uses the same {placeholders} in every language', () => {
    const mismatched: string[] = [];
    for (const key of Object.keys(translations.vi) as (keyof typeof translations.vi)[]) {
      const expected = placeholders(translations.vi[key]);
      for (const lang of ['en', 'km'] as const) {
        if (placeholders(translations[lang][key]).join() !== expected.join()) mismatched.push(`${lang}.${key}`);
      }
    }
    expect(mismatched).toEqual([]);
  });
});

describe('i18n helpers', () => {
  it('formatMessage fills known placeholders and leaves unknown ones visible', () => {
    expect(formatMessage('Còn {days} ngày', { days: 3 })).toBe('Còn 3 ngày');
    expect(formatMessage('{a} / {b}', { a: 1 })).toBe('1 / {b}');
    expect(formatMessage('no params')).toBe('no params');
  });

  it('translate looks up the key in the requested language', () => {
    expect(translate('en', 'statusDraft')).toBe('Draft');
    expect(translate('km', 'statusDraft')).toBe(translations.km.statusDraft);
  });

  it('statusLabel maps stored Vietnamese statuses and passes unknown values through', () => {
    for (const lang of LANGUAGES) {
      for (const [stored, key] of Object.entries(STATUS_KEYS)) {
        expect(statusLabel(translations[lang], stored)).toBe(translations[lang][key]);
      }
    }
    expect(statusLabel(translations.vi, 'Đã gửi')).toBe('Đã gửi');
    expect(statusLabel(translations.en, ' Đã gửi ')).toBe('Dispatched');
    expect(statusLabel(translations.en, 'Trạng thái tự tạo')).toBe('Trạng thái tự tạo');
    expect(statusLabel(translations.en, null)).toBe('');
  });

  it('seedLabel translates default categories in en and km only', () => {
    for (const [stored, labels] of Object.entries(SEED_LABELS)) {
      expect(labels.en, stored).toBeTruthy();
      expect(labels.km, stored).toBeTruthy();
      expect(VIETNAMESE_CHARS.test(labels.km), `km label for ${stored}`).toBe(false);
    }
    expect(seedLabel('vi', 'Công văn')).toBe('Công văn');
    expect(seedLabel('en', 'Công văn')).toBe(SEED_LABELS['Công văn'].en);
    expect(seedLabel('km', 'Công văn')).toBe(SEED_LABELS['Công văn'].km);
    expect(seedLabel('km', 'Danh mục riêng')).toBe('Danh mục riêng');
  });
});
