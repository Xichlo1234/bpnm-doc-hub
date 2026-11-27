import { describe, it, expect } from 'vitest';
import { tabMonogram, faviconSvg } from '../src/client/src/hooks/useAppChrome.ts';

describe('browser tab identity (monogram favicon)', () => {
  it('takes the first two letters/digits of the short name, upper-cased', () => {
    expect(tabMonogram('SGII')).toBe('SG');
    expect(tabMonogram('BPMN')).toBe('BP');
    expect(tabMonogram('  q.l-cv ')).toBe('QL');
    expect(tabMonogram('Đông Á')).toBe('ĐÔ');
    expect(tabMonogram('—')).toBe('');
  });

  it('draws a gold tile with the monogram, or a document mark when there is none', () => {
    const sg = faviconSvg('SG');
    expect(sg).toContain('<svg');
    expect(sg).toContain('>SG</text>');
    expect(sg).toContain('#fccf4d');
    expect(faviconSvg('')).not.toContain('<text');
    expect(faviconSvg('')).toContain('<path');
  });

  it('never lets markup characters into the SVG', () => {
    expect(faviconSvg('<a')).not.toContain('<a</text>');
  });
});
