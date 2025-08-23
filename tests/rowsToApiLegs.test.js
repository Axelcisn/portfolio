// tests/rowsToApiLegs.test.js
import rowsToApiLegs from '../components/Strategy/utils/rowsToApiLegs';

describe('rowsToApiLegs', () => {
  it('maps options and stock legs (including K/strike, premium, qty)', () => {
    const rows = [
      { type: 'lc', K: 100, premium: 5,   qty: 2 },
      { type: 'sp', strike: 90, premium: 1.2, qty: 1 },
      { type: 'sc', K: 120, premium: 2.3, qty: -5 }, // qty -> 0
      { type: 'lp', strike: 80, premium: 4.1 },      // qty defaults to 1
      { type: 'ls', price: 55, qty: 10 },
      { type: 'ss', premium: 60, qty: 1 },           // price via premium fallback
      { type: 'xx', K: 100, qty: 1 },                // ignored
      null,                                          // ignored
    ];

    expect(rowsToApiLegs(rows)).toEqual([
      { type: 'call',  side: 'long',  qty: 2, strike: 100, premium: 5 },
      { type: 'put',   side: 'short', qty: 1, strike: 90,  premium: 1.2 },
      { type: 'call',  side: 'short', qty: 0, strike: 120, premium: 2.3 },
      { type: 'put',   side: 'long',  qty: 1, strike: 80,  premium: 4.1 },
      { type: 'stock', side: 'long',  qty: 10, price: 55 },
      { type: 'stock', side: 'short', qty: 1,  price: 60 },
    ]);
  });

  it('handles non-finite values and defaults safely', () => {
    const rows = [
      { type: 'lc', K: 'NaN', premium: 'NaN', qty: 'NaN' }, // qty -> 1, strike null, premium omitted
      { type: 'sp', K: Infinity, premium: 2, qty: 3 },      // strike -> null
      { type: 'ls', qty: 2 },                               // stock with no price
    ];

    expect(rowsToApiLegs(rows)).toEqual([
      { type: 'call',  side: 'long',  qty: 1, strike: null },
      { type: 'put',   side: 'short', qty: 3, strike: null, premium: 2 },
      { type: 'stock', side: 'long',  qty: 2 },
    ]);
  });
});
