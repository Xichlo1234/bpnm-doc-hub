// The one definition of "the same partner code", shared by the application, the preflight check and
// the D1 column partners.code_key (migration 0011). SQLite's upper() only folds ASCII, so the key is
// computed here and stored; the unique index is on the stored key.
//
// Two codes are the same when they are equal after: Unicode compatibility normalisation (NFKC: composed
// vs. decomposed accents, full-width letters…), removing every space and invisible separator, and
// upper-casing (đt = ĐT, "AB C" = "ABC", "Ａ" = "A").
export function partnerCodeKey(code) {
  const key = String(code ?? '')
    .normalize('NFKC')
    .replace(/[\s­᠎​-‏⁠﻿]+/gu, '')
    .toUpperCase()
    .normalize('NFKC');
  return key || null;
}
