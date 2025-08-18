// services/ib-proxy/server.js
import express from 'express';
import fetch from 'node-fetch';
import https from 'https';

const app = express();
const PORT = process.env.PORT || 4010;
const IB = (process.env.IB_GATEWAY_URL || 'https://localhost:5000').replace(/\/$/, '');
const agent = new https.Agent({ rejectUnauthorized: false }); // CP Gateway uses self-signed cert

app.get('/v1/ping', (req, res) => res.json({ ok: true, up: true }));

async function ibGet(path) {
  const url = `${IB}${path.startsWith('/') ? '' : '/'}${path}`;
  const r = await fetch(url, { agent, headers: { Accept: 'application/json' } });
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
