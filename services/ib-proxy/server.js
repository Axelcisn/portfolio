// services/ib-proxy/server.js
import { createServer } from 'node:http';
import { Agent } from 'undici';

const PORT = process.env.PORT || 4010;
const rawIB = process.env.IB_GATEWAY_URL || 'https://localhost:5000';
// normalize base (no trailing slash)
const IB = rawIB.replace(/\/+$/, '');
// CP Gateway uses self-signed cert
const agent = new Agent({ connect: { rejectUnauthorized: false } });

async function ibGet(path) {
  // Try primary path first. Some gateways mount the Client Portal API under
  // /v1/api while others expose endpoints at the root. If primary 404s, retry
  // with the alternate base.
  const makeUrl = (base) => `${base}${path.startsWith('/') ? '' : '/'}${path}`;

  const primaryUrl = makeUrl(IB);
  let r = await fetch(primaryUrl, { dispatcher: agent, headers: { Accept: 'application/json' } });

  if (r.status === 404) {
    // If the requested path starts with /v1/api, try stripping that prefix
    if (path.match(/^\/v1\/api/i)) {
      const strippedPath = path.replace(/^\/v1\/api/i, '') || '/';
      const altUrl = makeUrl(IB) + (strippedPath.startsWith('/') ? '' : '/') + strippedPath;
      r = await fetch(altUrl, { dispatcher: agent, headers: { Accept: 'application/json' } });
    } else {
      // Otherwise try appending /v1/api to the base (for gateways that mount there)
      const altBase = IB.endsWith('/v1/api') ? IB.replace(/\/v1\/api$/, '') : `${IB}/v1/api`;
      const altUrl = makeUrl(altBase);
      r = await fetch(altUrl, { dispatcher: agent, headers: { Accept: 'application/json' } });
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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/v1/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, up: true }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/company') {
      const symbol = String(url.searchParams.get('symbol') || '').toUpperCase();
      if (!symbol) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'symbol required' }));
        return;
      }
      try {
        // Client Portal Gateway symbol resolver
        const data = await ibGet(`/v1/api/trsrv/stocks?symbol=${encodeURIComponent(symbol)}`);
        const arr = data?.symbols?.[0]?.contracts || [];
        const best = arr.find(c => c.isUS) || arr[0] || null;

        if (!best) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'not_found', symbol }));
          return;
        }

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
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not_found' }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'internal_error' }));
  }
});

server.listen(PORT, () => {
  console.log(`[ib-proxy] listening on http://localhost:${PORT} -> CP ${IB}`);
});
