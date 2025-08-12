// components/Options/ChainTable.jsx
"use client";

import { useMemo, useState } from "react";

/* -------- formatters -------- */
const fmtN = (v, d = 2) => (Number.isFinite(v) ? Number(v).toFixed(d) : "—");
const fmtPct = (v, d = 2) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "—");

/* -------- helpers -------- */
function parseExpiryKey(x) {
  // Try to parse ISO-like first; fallback to string sort
  const t = Date.parse(x);
  return Number.isFinite(t) ? t : x;
}

export default function ChainTable({
  currency = "USD",
  rows = [],                 // [{ type:'call'|'put', strike, expiry, bid, ask, mark, delta, gamma, theta, vega, rho, ivBid, ivAsk, oi, volume }]
  sort = "asc",              // 'asc' | 'desc'
  rowsMode = "10",           // '10' | '20' | 'all' | 'custom'
  customRows = 25,
  columns = {},              // { bid, ask, price, delta, gamma, theta, vega, rho, timeValue, intrinsicValue, askIv, bidIv }
  onUseSelection = () => {},
}) {
  const limitPerGroup = useMemo(() => {
    if (rowsMode === "all") return Number.POSITIVE_INFINITY;
    if (rowsMode === "custom") return Math.max(1, Number(customRows) || 1);
    const n = Number(rowsMode);
    return Number.isFinite(n) ? n : 10;
  }, [rowsMode, customRows]);

  // Selection state (by a stable row id derived from expiry+type+strike)
  const [selected, setSelected] = useState(() => new Set());
  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const clearSel = () => setSelected(new Set());

  // Group rows by expiry
  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows || []) {
      const key = r?.expiry || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    const keys = Array.from(map.keys());
    // sort expiry ascending by date then string
    keys.sort((a, b) => {
      const ka = parseExpiryKey(a);
      const kb = parseExpiryKey(b);
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return 0;
    });
    return keys.map((k) => ({ expiry: k, items: map.get(k) || [] }));
  }, [rows]);

  // strike sort per group + limit
  const dir = sort === "desc" ? -1 : 1;

  const col = {
    bid: !!columns.bid,
    ask: !!columns.ask,
    price: !!columns.price,
    delta: !!columns.delta,
    gamma: !!columns.gamma,
    theta: !!columns.theta,
    vega: !!columns.vega,
    rho: !!columns.rho,
    timeValue: !!columns.timeValue,
    intrinsicValue: !!columns.intrinsicValue,
    askIv: !!columns.askIv,
    bidIv: !!columns.bidIv,
  };

  const hasAny = rows?.length > 0;

  return (
    <div className="chain card">
      {!hasAny && (
        <div className="empty">
          <div className="title">No options loaded</div>
          <div className="sub">Pick a provider or upload a screenshot, then choose an expiry.</div>
        </div>
      )}

      {hasAny && (
        <>
          <div className="head">
            <div className="left">
              <strong>Options chain</strong>
              <span className="muted"> • Grouped by expiration</span>
            </div>
            <div className="right">
              <button
                className="btn"
                type="button"
                disabled={selected.size === 0}
                onClick={() => onUseSelection(Array.from(selected))}
                title={selected.size === 0 ? "Select one or more rows" : "Push selected rows"}
              >
                Use this set{selected.size ? ` (${selected.size})` : ""}
              </button>
              {selected.size > 0 && (
                <button className="btn ghost" type="button" onClick={clearSel}>
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="groups">
            {grouped.map(({ expiry, items }) => {
              const sorted = (items || [])
                .slice()
                .sort((a, b) => (a.strike === b.strike ? 0 : a.strike < b.strike ? -dir : dir))
                .slice(0, limitPerGroup);

              return (
                <section key={expiry} className="grp">
                  <div className="grp-title">
                    <div className="t">{expiry}</div>
                    <div className="sub">{sorted.length} rows</div>
                  </div>

                  <div className="table-wrap">
                    <table className="tbl" role="table" aria-label={`Options ${expiry}`}>
                      <thead>
                        <tr>
                          <th aria-label="select" />
                          <th>Type</th>
                          <th>Strike</th>
                          {col.bid && <th>Bid ({currency})</th>}
                          {col.ask && <th>Ask ({currency})</th>}
                          {col.price && <th>Mark ({currency})</th>}
                          {col.delta && <th>Δ</th>}
                          {col.gamma && <th>Γ</th>}
                          {col.theta && <th>Θ</th>}
                          {col.vega && <th>V</th>}
                          {col.rho && <th>ρ</th>}
                          {col.timeValue && <th>Time val.</th>}
                          {col.intrinsicValue && <th>Intr. val.</th>}
                          {col.askIv && <th>Ask IV</th>}
                          {col.bidIv && <th>Bid IV</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((r, i) => {
                          const id = `${expiry}|${r.type}|${r.strike}`;
                          const mark =
                            Number.isFinite(r?.mark) ? r.mark :
                            Number.isFinite(r?.bid) && Number.isFinite(r?.ask)
                              ? (Number(r.bid) + Number(r.ask)) / 2
                              : null;
                          return (
                            <tr key={id}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={selected.has(id)}
                                  onChange={() => toggleRow(id)}
                                  aria-label="Select row"
                                />
                              </td>
                              <td className={`ty ${r.type === "call" ? "call" : "put"}`}>
                                {r.type === "call" ? "Call" : "Put"}
                              </td>
                              <td className="num">{fmtN(r.strike, 2)}</td>
                              {col.bid && <td className="num">{fmtN(r.bid, 2)}</td>}
                              {col.ask && <td className="num">{fmtN(r.ask, 2)}</td>}
                              {col.price && <td className="num">{fmtN(mark, 2)}</td>}
                              {col.delta && <td className="num">{fmtN(r.delta, 4)}</td>}
                              {col.gamma && <td className="num">{fmtN(r.gamma, 6)}</td>}
                              {col.theta && <td className="num">{fmtN(r.theta, 4)}</td>}
                              {col.vega && <td className="num">{fmtN(r.vega, 4)}</td>}
                              {col.rho && <td className="num">{fmtN(r.rho, 4)}</td>}
                              {col.timeValue && <td className="num">{fmtN(r.timeValue, 2)}</td>}
                              {col.intrinsicValue && <td className="num">{fmtN(r.intrinsicValue, 2)}</td>}
                              {col.askIv && <td className="num">{fmtPct(r.ivAsk, 2)}</td>}
                              {col.bidIv && <td className="num">{fmtPct(r.ivBid, 2)}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      <style jsx>{`
        .chain{ padding: 10px; }
        .empty{ padding: 18px; text-align:left; }
        .empty .title{ font-weight:800; margin-bottom:4px; }
        .empty .sub{ opacity:.75; }

        .head{
          display:flex; align-items:center; justify-content:space-between;
          padding: 6px 2px 10px;
        }
        .left .muted{ opacity:.7; }
        .right{ display:flex; gap:8px; }
        .btn{
          height:32px; padding:0 12px; border-radius:8px; border:1px solid var(--border);
          background:var(--bg); color:var(--text); font-weight:700;
        }
        .btn:disabled{ opacity:.5; cursor:not-allowed; }
        .btn.ghost{ background:transparent; }

        .groups{ display:flex; flex-direction:column; gap:12px; }
        .grp{ border:1px solid var(--border); border-radius:12px; overflow:hidden; }
        .grp-title{
          display:flex; align-items:baseline; justify-content:space-between;
          padding:10px 12px; background:var(--card);
          border-bottom:1px solid var(--border);
        }
        .grp-title .t{ font-weight:800; }
        .grp-title .sub{ opacity:.7; font-size:12px; }

        .table-wrap{ width:100%; overflow:auto; }
        table.tbl{ width:100%; border-collapse:separate; border-spacing:0; }
        thead th{
          position:sticky; top:0; background:var(--card); z-index:1;
          text-align:left; font-size:12px; opacity:.8; padding:8px 10px; border-bottom:1px solid var(--border);
        }
        tbody td{ padding:8px 10px; border-bottom:1px solid var(--border); }
        td.num, th.num{ text-align:right; font-variant-numeric: tabular-nums; }
        td.ty.call{ color:#22c55e; font-weight:700; }
        td.ty.put{ color:#ef4444; font-weight:700; }
      `}</style>
    </div>
  );
}
