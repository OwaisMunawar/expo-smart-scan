import { parseReceipt } from '../parser';
import type { TextLine } from '../types';

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

describe('parseReceipt', () => {
  it('parses a clean US coffee shop receipt', () => {
    const result = parseReceipt(
      lines(`
        Harbor Street Coffee
        112 Harbor St, Portland OR
        Tel (503) 555-0142
        03/14/2026 08:41 AM
        Oat Latte            5.25
        2 x Croissant        7.00
        Drip Coffee          3.10
        Subtotal            15.35
        Sales Tax 8.5%       1.30
        TOTAL               16.65
        VISA ****4412       16.65
      `)
    );

    expect(result).toEqual({
      merchant: 'Harbor Street Coffee',
      date: '2026-03-14',
      currency: null,
      total: 16.65,
      subtotal: 15.35,
      tax: 1.3,
      totalSource: 'label',
      lineItems: [
        { description: 'Oat Latte', quantity: null, unitPrice: null, amount: 5.25 },
        { description: 'Croissant', quantity: 2, unitPrice: 3.5, amount: 7 },
        { description: 'Drip Coffee', quantity: null, unitPrice: null, amount: 3.1 },
      ],
    });
  });

  it('resolves a bare $ to USD', () => {
    const result = parseReceipt(['Corner Deli', 'Sandwich $8.50', 'Total $8.50']);
    expect(result.currency).toBe('USD');
    expect(result.total).toBe(8.5);
  });

  it('does not mistake SUBTOTAL for the total', () => {
    const result = parseReceipt(['Shop', 'SUBTOTAL 40.00', 'TAX 3.20', 'TOTAL 43.20']);
    expect(result.subtotal).toBe(40);
    expect(result.total).toBe(43.2);
  });

  it('prefers GRAND TOTAL over earlier TOTAL rows', () => {
    const result = parseReceipt([
      'Bistro Nine',
      'Food total 52.00',
      'Drinks total 18.00',
      'Service 7.00',
      'GRAND TOTAL 77.00',
    ]);
    expect(result.total).toBe(77);
  });

  it('ignores "total savings" and "total items" rows', () => {
    const result = parseReceipt([
      'Fresh Mart',
      'Apples 3.99',
      'TOTAL ITEMS 1',
      'TOTAL SAVINGS 1.00',
      'BALANCE DUE 3.99',
    ]);
    expect(result.total).toBe(3.99);
  });

  it('reads a European receipt with comma decimals, dotted date and EUR', () => {
    const result = parseReceipt(
      lines(`
        Bäckerei Sonnenschein
        Hauptstraße 12, 10115 Berlin
        05.03.2026 14:22
        Brezel               1,20
        Milchkaffee          3,80
        Summe EUR            5,00
        MwSt 7%              0,33
        Bar                 10,00
        Rückgeld             5,00
      `)
    );

    expect(result.merchant).toBe('Bäckerei Sonnenschein');
    expect(result.date).toBe('2026-03-05');
    expect(result.currency).toBe('EUR');
    expect(result.total).toBe(5);
    expect(result.tax).toBe(0.33);
    expect(result.lineItems.map((i) => i.amount)).toEqual([1.2, 3.8]);
  });

  it('handles thousands separators in both notations', () => {
    expect(parseReceipt(['Electronics Hub', 'Laptop 1,299.00', 'TOTAL 1,299.00']).total).toBe(1299);
    expect(parseReceipt(['Elektro Markt', 'Laptop 1.299,00', 'SUMME 1.299,00']).total).toBe(1299);
  });

  it('repairs common OCR digit substitutions', () => {
    const result = parseReceipt(['Taco Shack', 'Burrito l2.5O', 'Soda 2.O0', 'T0TAL l4.50']);
    expect(result.lineItems.map((i) => i.amount)).toEqual([12.5, 2]);
    expect(result.total).toBe(14.5);
  });

  it('repairs a dollar sign read as S and a space before the decimals', () => {
    const result = parseReceipt(['Noodle Bar', 'Ramen S13.50', 'Total S 15 .20']);
    expect(result.lineItems[0]?.amount).toBe(13.5);
    expect(result.currency).toBe('USD');
    expect(result.total).toBe(15.2);
  });

  it('picks up a total whose amount OCR split onto the next line', () => {
    const result = parseReceipt(['Green Grocer', 'Kale 2.99', 'Carrots 1.49', 'TOTAL', '4.48']);
    expect(result.total).toBe(4.48);
    expect(result.totalSource).toBe('label');
  });

  it('falls back to subtotal + tax when there is no total label', () => {
    const result = parseReceipt(['Hardware Co', 'Hammer 19.99', 'Subtotal 19.99', 'Tax 1.60']);
    expect(result.total).toBe(21.59);
    expect(result.totalSource).toBe('subtotal+tax');
  });

  it('falls back to the largest non-payment amount as a last resort', () => {
    const result = parseReceipt(['Market Stall', 'Honey 9.00', 'Jam 6.00', '15.00', 'Cash 20.00']);
    expect(result.total).toBe(15);
    expect(result.totalSource).toBe('largest');
  });

  it('does not treat cash tendered or change as the total', () => {
    const result = parseReceipt([
      'Pizza Place',
      'Margherita 12.00',
      'TOTAL 12.00',
      'Amount tendered 50.00',
      'Change 38.00',
    ]);
    expect(result.total).toBe(12);
  });

  it('takes the larger total when a card slip adds a tip', () => {
    const result = parseReceipt(['Sushi Den', 'Total 40.00', 'Tip 8.00', 'Total 48.00']);
    expect(result.total).toBe(48);
  });

  it('extracts quantity, unit price and amount from "qty x price amount" rows', () => {
    const result = parseReceipt([
      'Deli',
      'Bagel 3 x 1.50 4.50',
      'Juice 2 @ 3.25 6.50',
      'Total 11.00',
    ]);
    expect(result.lineItems).toEqual([
      { description: 'Bagel', quantity: 3, unitPrice: 1.5, amount: 4.5 },
      { description: 'Juice', quantity: 2, unitPrice: 3.25, amount: 6.5 },
    ]);
  });

  it('computes the amount when only a unit price is printed', () => {
    const result = parseReceipt(['Deli', 'Muffin 2 @ 2.25', 'Total 4.50']);
    expect(result.lineItems[0]).toEqual({
      description: 'Muffin',
      quantity: 2,
      unitPrice: 2.25,
      amount: 4.5,
    });
  });

  it('keeps discounts as negative line items and tolerates tax flags', () => {
    const result = parseReceipt([
      'Supermart',
      'MILK 2% 1GAL 4.29 F',
      'COUPON MILK 1.00-',
      'BREAD WHEAT 3.49 T',
      'TOTAL 6.78',
    ]);
    expect(result.lineItems.map((i) => [i.description, i.amount])).toEqual([
      ['MILK 2% 1GAL', 4.29],
      ['COUPON MILK', -1],
      ['BREAD WHEAT', 3.49],
    ]);
  });

  it('strips SKUs and dot leaders from descriptions', () => {
    const result = parseReceipt(['Book Nook', '9780141036144 Novel.......14.99', 'Total 14.99']);
    expect(result.lineItems[0]?.description).toBe('Novel');
  });

  it('does not read percentages, phone numbers or dates as amounts', () => {
    const result = parseReceipt([
      'Quick Fuel',
      'Call 555.123.4567',
      '2026-01-09',
      'Sales tax 8.25% 0.83',
      'Total 10.83',
    ]);
    expect(result.tax).toBe(0.83);
    expect(result.total).toBe(10.83);
    expect(result.date).toBe('2026-01-09');
    expect(result.lineItems).toEqual([]);
  });

  it('strips a "welcome to" banner from the merchant name', () => {
    expect(parseReceipt(['*** WELCOME TO LAKESIDE MARKET ***', 'Total 3.00']).merchant).toBe(
      'LAKESIDE MARKET'
    );
    expect(parseReceipt(['Welcome to Pine Hardware!', 'Total 3.00']).merchant).toBe(
      'Pine Hardware'
    );
  });

  it('skips address, phone and receipt-number lines when choosing the merchant', () => {
    const result = parseReceipt([
      'Receipt #20931',
      '(212) 555-0199',
      '48 Mercer Street',
      'Mercer Street Books',
      'Total 20.00',
    ]);
    expect(result.merchant).toBe('Mercer Street Books');
  });

  it('parses month-name dates and honours dateOrder for ambiguous numeric dates', () => {
    expect(parseReceipt(['Cafe', 'Mar 7, 2026', 'Total 1.00']).date).toBe('2026-03-07');
    expect(parseReceipt(['Cafe', '07-Mar-26', 'Total 1.00']).date).toBe('2026-03-07');
    expect(parseReceipt(['Cafe', '04/03/2026', 'Total 1.00']).date).toBe('2026-04-03');
    expect(parseReceipt(['Cafe', '04/03/2026', 'Total 1.00'], { dateOrder: 'DMY' }).date).toBe(
      '2026-03-04'
    );
    expect(parseReceipt(['Cafe', '25/12/2025', 'Total 1.00']).date).toBe('2025-12-25');
  });

  it('rejects impossible dates', () => {
    expect(parseReceipt(['Cafe', '02/31/2026', 'Total 1.00']).date).toBeNull();
  });

  it('uses defaultCurrency for ambiguous symbols and prefers explicit ISO codes', () => {
    expect(parseReceipt(['Chai Stop', 'Chai Rs 120.00', 'Total Rs 120.00']).currency).toBeNull();
    expect(
      parseReceipt(['Chai Stop', 'Chai Rs 120.00', 'Total Rs 120.00'], { defaultCurrency: 'pkr' })
        .currency
    ).toBe('PKR');
    expect(parseReceipt(['Maple Diner', 'Total CAD $14.00']).currency).toBe('CAD');
    expect(parseReceipt(['Tea Room', 'Scone £3.50', 'Total £3.50']).currency).toBe('GBP');
    expect(parseReceipt(['Ramen-ya', 'Total ¥1200']).total).toBe(1200);
  });

  it('merges OCR observations on the same visual row before parsing', () => {
    const obs = (text: string, x: number, y: number): TextLine => ({
      text,
      confidence: 0.95,
      box: { x, y, width: 0.3, height: 0.03 },
    });
    // Deliberately shuffled, with prices slightly offset vertically as on a real photo.
    const result = parseReceipt([
      obs('12.00', 0.7, 0.305),
      obs('Harbor Books', 0.3, 0.1),
      obs('TOTAL', 0.1, 0.4),
      obs('Notebook', 0.1, 0.3),
      obs('Pens', 0.1, 0.35),
      obs('4.50', 0.7, 0.352),
      obs('16.50', 0.7, 0.398),
    ]);
    expect(result.merchant).toBe('Harbor Books');
    expect(result.lineItems.map((i) => [i.description, i.amount])).toEqual([
      ['Notebook', 12],
      ['Pens', 4.5],
    ]);
    expect(result.total).toBe(16.5);
  });

  it('returns an empty receipt for empty or non-receipt input', () => {
    expect(parseReceipt([])).toEqual({
      merchant: null,
      date: null,
      currency: null,
      total: null,
      subtotal: null,
      tax: null,
      lineItems: [],
      totalSource: null,
    });
    const prose = parseReceipt(['The quick brown fox', 'jumps over the lazy dog']);
    expect(prose.total).toBeNull();
    expect(prose.lineItems).toEqual([]);
  });

  it('survives a noisy real-world style scan', () => {
    const result = parseReceipt(
      lines(`
        ~~ ' . ,
        SUNRISE MARKET #0418
        1850 W OAK AVE
        STORE 0418  TERM 03  TRANS 55821
        CASHIER: DANA
        ORGANIC BANANAS      1.87 F
        GREEK YOGURT 32OZ    5.49 F
        PAPER TOWELS 6PK    ll.99 T
        BRIGHT SAVINGS       2.00-
        SUBT0TAL            l7.35
        TAX                  0.96
        ****  TOTAL         18.31
        DEBIT TEND          18.31
        CHANGE DUE           0.00
        09/28/26  17:02
        THANK YOU FOR SHOPPING
      `)
    );

    expect(result.merchant).toBe('SUNRISE MARKET #0418');
    expect(result.date).toBe('2026-09-28');
    expect(result.subtotal).toBe(17.35);
    expect(result.tax).toBe(0.96);
    expect(result.total).toBe(18.31);
    expect(result.lineItems.map((i) => i.amount)).toEqual([1.87, 5.49, 11.99, -2]);
  });
});
