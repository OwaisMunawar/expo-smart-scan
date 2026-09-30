import { findAmounts, normalizeNumericTokens, parseAmount } from '../parser/amounts';
import { detectCurrency } from '../parser/currency';
import { parseDate } from '../parser/dates';
import { groupIntoRows } from '../parser/rows';

describe('parseAmount', () => {
  it.each([
    ['12.50', 12.5],
    ['12,50', 12.5],
    ['1,234.56', 1234.56],
    ['1.234,56', 1234.56],
    ["1'234.56", 1234.56],
    ['$ 7.00', 7],
    ['-3.00', -3],
    ['3.00-', -3],
    ['1200', 1200],
  ])('parses %s', (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });

  it.each(['', 'abc', '1.2.3'])('rejects %p', (raw) => {
    expect(parseAmount(raw)).toBeNull();
  });
});

describe('findAmounts', () => {
  it('returns amounts left to right with positions', () => {
    expect(findAmounts('Bagel 2 x 1.50 3.00')).toEqual([
      { value: 1.5, start: 10, end: 14 },
      { value: 3, start: 15, end: 19 },
    ]);
  });

  it('accepts integer amounts only with a currency symbol', () => {
    expect(findAmounts('Qty 3')).toEqual([]);
    expect(findAmounts('Total $40').map((a) => a.value)).toEqual([40]);
  });
});

describe('normalizeNumericTokens', () => {
  it('leaves ordinary words alone', () => {
    expect(normalizeNumericTokens('SOLD OUT Novel.......14.99')).toBe('SOLD OUT Novel.......14.99');
  });

  it('repairs lookalike characters inside amounts', () => {
    expect(normalizeNumericTokens('Tea l.5O')).toBe('Tea 1.50');
    expect(normalizeNumericTokens('Tea 4 . 99')).toBe('Tea 4.99');
  });
});

describe('parseDate', () => {
  it.each([
    ['2026/03/14', '2026-03-14'],
    ['14.03.2026', '2026-03-14'],
    ['3/4/26', '2026-03-04'],
    ['1st January 2026', '2026-01-01'],
    ['September 30, 2026', '2026-09-30'],
    ['Sept 30 26', '2026-09-30'],
  ])('parses %s', (raw, expected) => {
    expect(parseDate(raw)).toBe(expected);
  });

  it.each(['12 Market 2026', '13/13/2026', '1989-01-01', 'no date here'])('rejects %p', (raw) => {
    expect(parseDate(raw)).toBeNull();
  });
});

describe('detectCurrency', () => {
  it('counts votes across lines', () => {
    expect(detectCurrency(['€ 3.00', '€ 4.00', 'USD'])).toBe('EUR');
  });

  it('recognises dirham abbreviations', () => {
    expect(detectCurrency(['Total Dhs 45.00'])).toBe('AED');
  });

  it('lets defaultCurrency override a bare dollar sign', () => {
    expect(detectCurrency(['$4.00'], 'aud')).toBe('AUD');
  });
});

describe('groupIntoRows', () => {
  it('ignores empty and zero-height observations', () => {
    expect(
      groupIntoRows([
        { text: '  ', confidence: 1, box: { x: 0, y: 0, width: 1, height: 0.1 } },
        { text: 'ghost', confidence: 1, box: { x: 0, y: 0, width: 1, height: 0 } },
      ])
    ).toEqual([]);
  });
});
