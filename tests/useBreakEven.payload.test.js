// tests/useBreakEven.payload.test.js
// Smoke tests for the request payload shape expected by /api/strategy/breakeven.

import { __testOnly_buildPayload as build } from '../components/Strategy/hooks/useBreakEven';

describe('useBreakEven payload builder (smoke)', () => {
  it('maps option & stock legs with numeric fields', () => {
    const legs = [
      { type: 'call',  side: 'long',  strike: '100', premium: '5',   qty: '2' },
      { type: 'put',   side: 'short', strike: 90,    premium: 1.25,  qty: 1 },
      { type: 'stock', side: 'long',  price: 55,     qty: 3 }, // stocks may be present; BE API may ignore
      { type: 'call',  side: 'short', strike: 120,   premium: 2.3,   qty: -4 }, // qty -> 0 clamp
    ];

    const out = build({
      legs,
      spot: 101.5,
      strategy: 'bull_call_spread',
      contractSize: 1,
    });

    expect(out.legs).toEqual([
      { type: 'call',  side: 'long',  qty: 2, strike: 100, premium: 5 },
      { type: 'put',   side: 'short', qty: 1, strike: 90,  premium: 1.25 },
      { type: 'stock', side: 'long',  qty: 3, price: 55 },
      { type: 'call',  side: 'short', qty: 0, strike: 120, premium: 2.3 },
    ]);
    expect(out.strategy).toBe('bull_call_spread');
    expect(out.contractSize).toBe(1);
    expect(out.spot).toBe(101.5);
  });

  it('omits falsy strategy and sanitizes numbers', () => {
    const legs = [
      { type: 'put', side: 'long', strike: 'NaN', premium: 'NaN', qty: 'NaN' }, // strike->null, qty->1, premium omitted
    ];
    const out = build({ legs, spot: null, strategy: '', contractSize: 2 });

    expect(out.strategy).toBeUndefined();
    expect(out.legs).toEqual([
      { type: 'put', side: 'long', qty: 1, strike: null },
    ]);
    expect(out.contractSize).toBe(2);
    expect(out.spot).toBeNull();
  });

  it('accepts legacy strategyKey but sends strategy', () => {
    const legs = [{ type: 'call', side: 'long', strike: 100, premium: 5, qty: 1 }];
    const out = build({ legs, strategyKey: 'long_call' });

    expect(out.strategy).toBe('long_call');
    expect(out).not.toHaveProperty('strategyKey');
  });
});
