// tests/ibkrService.spec.js
import { searchSymbols } from '../lib/services/ibkrService.js';
import https from 'https';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

describe('ibkrService retry logic', () => {
  const realRequest = https.request;

  beforeEach(() => {
    // Ensure deterministic config
    process.env.IBKR_PORT = '5001';
  });

  afterEach(() => {
    https.request = realRequest;
    delete process.env.IB_PROXY_URL;
    delete process.env.IBKR_PORT;
  });

  test('retries when primary returns 404 and succeeds on alternate base', async () => {
    // Simulate configured base with trailing /v1/api
    process.env.IB_PROXY_URL = 'https://example.test/v1/api';

    let callIndex = 0;

    https.request = (options, cb) => {
      callIndex += 1;

      // Minimal mock "res" with event handlers
      const res = {
        statusCode: callIndex === 1 ? 404 : 200,
        _handlers: {},
        on(event, fn) { this._handlers[event] = fn; }
      };

      // A minimal mock request object
      const req = {
        write() {},
        on() {},
        end() {
          // Defer to emulate async response
          setImmediate(() => {
            // Call the response callback
            cb(res);
            const body = callIndex === 1
              ? JSON.stringify({ detail: 'Not Found' })
              : JSON.stringify([
                  { conid: 123, symbol: 'AAPL', companyName: 'Apple Inc.' }
                ]);
            if (res._handlers.data) res._handlers.data(body);
            if (res._handlers.end) res._handlers.end();
          });
        }
      };

      return req;
    };

    const results = await searchSymbols('AAPL', 5);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });
});
