// lib/services/ibkrService.js
// Consolidated Interactive Brokers data service
// Handles all IBKR API interactions in one place

import { readFileSync } from 'fs';
import https from 'https';
import http from 'http';

// Configuration
function getIBKRConfig() {
  const port = (() => {
    try {
      return readFileSync('/tmp/ibkr_gateway_port', 'utf8').trim() || '5001';
    } catch {
      return process.env.IBKR_PORT || '5001';
    }
  })();

  const baseUrl = process.env.IB_PROXY_URL || `https://localhost:${port}/v1/api`;
  const bearerToken = process.env.IB_PROXY_TOKEN || process.env.IB_BRIDGE_TOKEN || '';
  
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    bearerToken,
    headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {},
    timeout: 10000, // 10 seconds default timeout
  };
}

// Low-level HTTPS request handler with self-signed cert support
async function ibRequest(path, options = {}) {
  const config = getIBKRConfig();

  // Internal helper to perform a single HTTP(S) request against a given base URL
  const doRequest = (base, reqPath) => new Promise((resolve, reject) => {
    try {
      const url = new URL(base + (reqPath || path));
      const isHttps = url.protocol === 'https:';

      const requestOptions = {
        method: options.method || 'GET',
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...config.headers,
          ...(options.headers || {})
        },
        timeout: options.timeout || config.timeout,
      };

      if (isHttps) {
        requestOptions.agent = new https.Agent({ rejectUnauthorized: false });
      }

      const req = (isHttps ? https : http).request(requestOptions, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: json });
          } catch {
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data });
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`IBKR connection failed: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('IBKR request timeout'));
      });

      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }

      req.end();
    } catch (err) {
      reject(err);
    }
  });

  try {
    // Prefer global fetch if available (tests often mock global.fetch)
    if (typeof globalThis.fetch === 'function') {
      const makeUrl = (base, reqPath) => base + (reqPath || path);
      const primaryUrl = makeUrl(config.baseUrl, path);
      const opts = {
        method: options.method || 'GET',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...config.headers,
          ...(options.headers || {})
        },
        body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
      };

      const r = await globalThis.fetch(primaryUrl, opts);
      if (r.status !== 404) {
        const text = await r.text();
        try { return { ok: r.ok, status: r.status, data: JSON.parse(text) }; } catch { return { ok: r.ok, status: r.status, data: text }; }
      }

      // On 404, try alternate strategies similar to doRequest path
      if (path.match(/^\/v1\/api/i)) {
        const stripped = path.replace(/^\/v1\/api/i, '') || '/';
        const altUrl = makeUrl(config.baseUrl, stripped);
        const r2 = await globalThis.fetch(altUrl, opts);
        const text2 = await r2.text();
        try { return { ok: r2.ok, status: r2.status, data: JSON.parse(text2) }; } catch { return { ok: r2.ok, status: r2.status, data: text2 }; }
      }

      if (config.baseUrl.match(/\/v1\/api$/i)) {
        const baseStripped = config.baseUrl.replace(/\/v1\/api$/i, '');
        const altUrl = makeUrl(baseStripped, path);
        const r2 = await globalThis.fetch(altUrl, opts);
        const text2 = await r2.text();
        try { return { ok: r2.ok, status: r2.status, data: JSON.parse(text2) }; } catch { return { ok: r2.ok, status: r2.status, data: text2 }; }
      }

      // Fall through to http/https fallback if fetch returned 404 and alternates didn't help
    }

    // Fallback to lower-level http/https request when fetch isn't available
    const primaryRes = await doRequest(config.baseUrl, path);
    if (primaryRes.status === 404) {
      // If path starts with /v1/api, retry stripping that prefix
      if (path.match(/^\/v1\/api/i)) {
        const stripped = path.replace(/^\/v1\/api/i, '') || '/';
        const altRes = await doRequest(config.baseUrl, stripped);
        return altRes;
      }

      // If base ends with /v1/api, try base without that suffix
      if (config.baseUrl.match(/\/v1\/api$/i)) {
        const baseStripped = config.baseUrl.replace(/\/v1\/api$/i, '');
        const altRes = await doRequest(baseStripped, path);
        return altRes;
      }
    }
    return primaryRes;
  } catch (err) {
    throw err;
  }
}

// Helper to parse numbers safely
function parseNum(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// ================== PUBLIC API METHODS ==================

/**
 * Search for symbols/companies
 * @param {string} query - Search query
 * @param {number} limit - Max results (default: 10)
 * @returns {Promise<Array>} Array of matching symbols
 */
export async function searchSymbols(query, limit = 10) {
  if (!query || query.trim().length === 0) {
    throw new Error('Search query required');
  }

  try {
    // Primary: Use secdef/search endpoint
    const response = await ibRequest('/iserver/secdef/search', {
      method: 'POST',
      body: { 
        symbol: query.trim().toUpperCase(),
        name: true,
        secType: 'STK' // Focus on stocks
      }
    });

    if (response.ok && Array.isArray(response.data)) {
      return response.data
        .filter(item => item?.conid && item?.symbol)
        .slice(0, limit)
        .map(item => ({
          conid: String(item.conid),
          symbol: item.symbol,
          name: item.companyName || item.description || item.name || '',
          exchange: item.exchange || item.listingExchange || null,
          currency: item.currency || null,
          secType: item.secType || 'STK'
        }));
    }

    // Fallback: Use stocks endpoint
    const fallback = await ibRequest(`/trsrv/stocks?symbol=${encodeURIComponent(query)}`);
    if (fallback.ok && fallback.data) {
      const items = Array.isArray(fallback.data) ? fallback.data : Object.values(fallback.data).flat();
      return items
        .filter(item => item?.conid && item?.symbol)
        .slice(0, limit)
        .map(item => ({
          conid: String(item.conid),
          symbol: item.symbol || item.ticker,
          name: item.name || item.companyName || '',
          exchange: item.exchange || null,
          currency: item.currency || null,
          secType: 'STK'
        }));
    }

    throw new Error('No results found');
  } catch (error) {
    throw new Error(`Symbol search failed: ${error.message}`);
  }
}

/**
 * Get real-time quote data for a symbol
 * @param {string} symbol - Stock symbol
 * @returns {Promise<Object>} Quote data including price, bid/ask, etc.
 */
export async function getQuote(symbol) {
  if (!symbol) {
    throw new Error('Symbol required');
  }

  const sym = symbol.trim().toUpperCase();

  try {
    // Step 1: Search for the symbol to get conid
    const searchResult = await searchSymbols(sym, 1);
    if (!searchResult || searchResult.length === 0) {
      throw new Error(`Symbol ${sym} not found`);
    }

    const { conid, name, exchange, currency } = searchResult[0];

    // Step 2: Get market data snapshot
    const fields = '31,84,86,70,71,82,83,87,88,7295,7296'; // last, bid, ask, high, low, close, change%, volume, 52w high/low
    const snapshot = await ibRequest(
      `/iserver/marketdata/snapshot?conids=${conid}&fields=${fields}`
    );

    if (!snapshot.ok || !Array.isArray(snapshot.data) || snapshot.data.length === 0) {
      throw new Error('No market data available');
    }

    const data = snapshot.data[0];
    
    return {
      symbol: sym,
      conid,
      name,
      exchange,
      currency,
      price: parseNum(data['31']), // Last price
      bid: parseNum(data['84']),
      ask: parseNum(data['86']),
      high: parseNum(data['70']),
      low: parseNum(data['71']),
      close: parseNum(data['82']),
      changePercent: parseNum(data['83']),
      volume: parseNum(data['87']),
      avgVolume: parseNum(data['88']),
      high52Week: parseNum(data['7295']),
      low52Week: parseNum(data['7296']),
      timestamp: Date.now()
    };
  } catch (error) {
    throw new Error(`Failed to get quote for ${symbol}: ${error.message}`);
  }
}

/**
 * Get historical price data
 * @param {string} symbol - Stock symbol
 * @param {string} period - Time period (1d, 1w, 1m, 3m, 6m, 1y, 2y, 5y)
 * @param {string} bar - Bar size (1min, 5min, 15min, 30min, 1h, 1d, 1w, 1m)
 * @returns {Promise<Array>} Array of price bars
 */
export async function getHistoricalData(symbol, period = '1y', bar = '1d') {
  if (!symbol) {
    throw new Error('Symbol required');
  }

  try {
    // Step 1: Get conid for the symbol
    const searchResult = await searchSymbols(symbol, 1);
    if (!searchResult || searchResult.length === 0) {
      throw new Error(`Symbol ${symbol} not found`);
    }

    const { conid } = searchResult[0];

    // Step 2: Request historical data
    const response = await ibRequest(
      `/iserver/marketdata/history?conid=${conid}&period=${period}&bar=${bar}`
    );

    if (!response.ok || !response.data) {
      throw new Error('No historical data available');
    }

    const { data: histData } = response.data;
    if (!histData || histData.length === 0) {
      throw new Error('Empty historical data');
    }

    // Transform to consistent format
    return histData.map(bar => ({
      time: bar.t, // Unix timestamp in milliseconds
      open: parseNum(bar.o),
      high: parseNum(bar.h),
      low: parseNum(bar.l),
      close: parseNum(bar.c),
      volume: parseNum(bar.v)
    })).filter(bar => bar.close !== null);
  } catch (error) {
    throw new Error(`Failed to get historical data for ${symbol}: ${error.message}`);
  }
}

/**
 * Get options chain for a symbol
 * @param {string} symbol - Stock symbol
 * @param {string} expiry - Optional expiry date (YYYYMMDD format)
 * @returns {Promise<Object>} Options chain data
 */
export async function getOptionsChain(symbol, expiry = null) {
  if (!symbol) {
    throw new Error('Symbol required');
  }

  try {
    // Step 1: Get conid for the underlying
    const searchResult = await searchSymbols(symbol, 1);
    if (!searchResult || searchResult.length === 0) {
      throw new Error(`Symbol ${symbol} not found`);
    }

    const { conid } = searchResult[0];

    // Step 2: Get secdef info to find option conids
    const secdefResponse = await ibRequest(
      `/iserver/secdef/search?conid=${conid}`
    );

    if (!secdefResponse.ok) {
      throw new Error('Failed to get contract details');
    }

    // Step 3: Get strikes and expirations
    const strikesResponse = await ibRequest(
      `/iserver/secdef/strikes?conid=${conid}&sectype=OPT`
    );

    if (!strikesResponse.ok || !strikesResponse.data) {
      throw new Error('No options data available');
    }

    const { call: calls = [], put: puts = [] } = strikesResponse.data;
    
    // Step 4: Get market data for options (if specific expiry provided)
    let optionsData = { calls: [], puts: [] };
    
    if (expiry && calls.length > 0) {
      // Filter by expiry and get market data
      const callConids = calls
        .filter(opt => opt.expiry === expiry)
        .map(opt => opt.conid)
        .join(',');
        
      if (callConids) {
        const callSnapshot = await ibRequest(
          `/iserver/marketdata/snapshot?conids=${callConids}&fields=31,84,86,87,88,7633`
        );
        
        if (callSnapshot.ok && Array.isArray(callSnapshot.data)) {
          optionsData.calls = callSnapshot.data.map(item => ({
            strike: parseNum(item.strike),
            bid: parseNum(item['84']),
            ask: parseNum(item['86']),
            last: parseNum(item['31']),
            volume: parseNum(item['87']),
            openInterest: parseNum(item['88']),
            impliedVol: parseNum(item['7633'])
          }));
        }
      }
      
      // Similar for puts
      const putConids = puts
        .filter(opt => opt.expiry === expiry)
        .map(opt => opt.conid)
        .join(',');
        
      if (putConids) {
        const putSnapshot = await ibRequest(
          `/iserver/marketdata/snapshot?conids=${putConids}&fields=31,84,86,87,88,7633`
        );
        
        if (putSnapshot.ok && Array.isArray(putSnapshot.data)) {
          optionsData.puts = putSnapshot.data.map(item => ({
            strike: parseNum(item.strike),
            bid: parseNum(item['84']),
            ask: parseNum(item['86']),
            last: parseNum(item['31']),
            volume: parseNum(item['87']),
            openInterest: parseNum(item['88']),
            impliedVol: parseNum(item['7633'])
          }));
        }
      }
    }

    // Get available expiries
    const expiryDates = [...new Set([
      ...calls.map(c => c.expiry),
      ...puts.map(p => p.expiry)
    ])].filter(Boolean).sort();

    return {
      symbol,
      underlyingConid: conid,
      expiries: expiryDates,
      selectedExpiry: expiry,
      calls: optionsData.calls,
      puts: optionsData.puts,
      timestamp: Date.now()
    };
  } catch (error) {
    throw new Error(`Failed to get options chain for ${symbol}: ${error.message}`);
  }
}

/**
 * Get option expiry dates for a symbol
 * @param {string} symbol - Stock symbol
 * @returns {Promise<Array>} Array of expiry dates
 */
export async function getOptionExpiries(symbol) {
  if (!symbol) {
    throw new Error('Symbol required');
  }

  try {
    const chain = await getOptionsChain(symbol);
    return chain.expiries || [];
  } catch (error) {
    throw new Error(`Failed to get expiries for ${symbol}: ${error.message}`);
  }
}

/**
 * Keep connection alive (prevent session timeout)
 * @returns {Promise<boolean>} Success status
 */
export async function keepAlive() {
  try {
    const response = await ibRequest('/iserver/auth/status', { method: 'POST' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if IBKR gateway is connected and authenticated
 * @returns {Promise<Object>} Connection status
 */
export async function checkConnection() {
  try {
    const response = await ibRequest('/iserver/auth/status');
    return {
      connected: response.ok,
      authenticated: response.data?.authenticated || false,
      competing: response.data?.competing || false,
      serverName: response.data?.serverName || null,
      fail: response.data?.fail || null
    };
  } catch (error) {
    return {
      connected: false,
      authenticated: false,
      error: error.message
    };
  }
}

// Export default object with all methods
export default {
  searchSymbols,
  getQuote,
  getHistoricalData,
  getOptionsChain,
  getOptionExpiries,
  keepAlive,
  checkConnection
};
