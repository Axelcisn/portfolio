// services/ib-proxy/server.js
import express from 'express';
import fetch from 'node-fetch';
import https from 'https';

const app = express();
const PORT = process.env.PORT || 4010;
const rawIB = process.env.IB_GATEWAY_URL || 'https://localhost:5000';
// normalize base (no trailing slash)
const IB = rawIB.replace(/\/+$/, '');
const agent = new https.Agent({ rejectUnauthorized: false }); // CP Gateway uses self-signed cert

app.get('/v1/ping', (req, res) => res.json({ ok: true, up: true }));

async function ibGet(path) {
  // Try primary path first. Some gateways mount the Client Portal API under
  // /v1/api while others expose endpoints at the root. If primary 404s, retry
  // with the alternate base.
  const makeUrl = (base) => `${base}${path.startsWith('/') ? '' : '/'}${path}`;

  const primaryUrl = makeUrl(IB);
  let r = await fetch(primaryUrl, { agent, headers: { Accept: 'application/json' } });

  if (r.status === 404) {
    // If the requested path starts with /v1/api, try stripping that prefix
    if (path.match(/^\/v1\/api/i)) {
      const strippedPath = path.replace(/^\/v1\/api/i, '') || '/';
      const altUrl = makeUrl(IB) + (strippedPath.startsWith('/') ? '' : '/') + strippedPath;
      r = await fetch(altUrl, { agent, headers: { Accept: 'application/json' } });
    } else {
      // Otherwise try appending /v1/api to the base (for gateways that mount there)
      const altBase = IB.endsWith('/v1/api') ? IB.replace(/\/v1\/api$/, '') : `${IB}/v1/api`;
      const altUrl = makeUrl(altBase);
      r = await fetch(altUrl, { agent, headers: { Accept: 'application/json' } });
    }
  }

  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  if (!r.ok) {
    const msg = (j && j.error) || r.statusText || 'ib_error';
    throw new Error(`${msg} (${r.status})`);
  }
  return j;
}

// GET /v1/company?symbol=AAPL
app.get('/v1/company', async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  if (!symbol) return res.status(400).json({ ok: false, error: 'symbol required' });
  try {
    // Client Portal Gateway symbol resolver
    const data = await ibGet(`/v1/api/trsrv/stocks?symbol=${encodeURIComponent(symbol)}`);
    const arr = data?.symbols?.[0]?.contracts || [];
    const best = arr.find(c => c.isUS) || arr[0] || null;

    if (!best) return res.json({ ok: false, error: 'not_found', symbol });

    const out = {
      ok: true,
      symbol,
      conid: best.conid ?? null,
      longName: best.companyName ?? null,
      currency: best.currency ?? null,
      primaryExchange: best.primaryExchange || best.exchange || null,
      rawExchange: best.exchange || null,
    };
    if (process.env.DEBUG_IB_PROXY === '1') out._raw = data;
    res.json(out);
  } catch (e) {
    res.json({ ok: false, error: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`[ib-proxy] listening on http://localhost:${PORT} -> CP ${IB}`);
});
