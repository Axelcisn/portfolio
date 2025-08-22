// tests/api/options.route.spec.js
import { vi, describe, test, expect, afterEach } from 'vitest';

import { GET } from '../../app/api/options/route.js';

describe('options route', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  test('returns 200 with error on fetch failure', async () => {
    global.fetch = vi.fn(async () => { throw new Error('bad'); });
    const req = new Request('http://localhost/api/options?symbol=AAPL');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(false);
    expect(j.error).toBeDefined();
  });
});

