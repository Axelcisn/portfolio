// components/Strategy/StrategyConfigTable.jsx
"use client";

/**
 * Inline‑editable configuration table.
 * Columns: Position | Strike | Volume | Premium
 * Emits onChange(updatedLegs) on any edit.
 */
export default function StrategyConfigTable({ legs = {}, currency = "USD", onChange }) {
  const rows = [
    { key: "lc", label: "Long Call" },
    { key: "sc", label: "Short Call" },
    { key: "lp", label: "Long Put" },
    { key: "sp", label: "Short Put" },
  ];

  const val = (k, f, d) => (legs?.[k]?.[f] ?? d);

  const onEdit = (k, field, raw) => {
    const next = { ...legs };
    const cur = { enabled: false, K: null, qty: 0, premium: null, ...(next[k] || {}) };
    if (field === "enabled") cur.enabled = !!raw;
    else if (field === "K") {
      const n = Number(String(raw).replace(",", "."));
      cur.K = Number.isFinite(n) ? n : cur.K;
    } else if (field === "qty") {
      const n = Number(String(raw).replace(",", "."));
      cur.qty = Number.isFinite(n) ? n : cur.qty;
    } else if (field === "premium") {
      const n = Number(String(raw).replace(",", "."));
      cur.premium = Number.isFinite(n) ? n : cur.premium;
    }
    next[k] = cur;
    onChange?.(next);
  };

  const sign = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";

  return (
    <section className="card white-surface">
      <h3 style={{ marginTop: 0 }}>Configuration</h3>

      <div className="cfg-wrap">
        <table className="cfg">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Position</th>
              <th>Strike</th>
              <th>Volume</th>
              <th>Premium</th>
              <th style={{ width: 88, textAlign: "center" }}>On</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="pos">{r.label}</td>
                <td>
                  <input
                    className="field"
                    type="number"
                    placeholder="Strike"
                    value={val(r.key, "K", "") ?? ""}
                    onChange={(e) => onEdit(r.key, "K", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="field"
                    type="number"
                    placeholder="1"
                    value={val(r.key, "qty", "") ?? ""}
                    onChange={(e) => onEdit(r.key, "qty", e.target.value)}
                  />
                </td>
                <td>
                  <div className="prem">
                    <span className="sym">{sign}</span>
                    <input
                      className="field"
                      type="number"
                      placeholder="0"
                      value={val(r.key, "premium", "") ?? ""}
                      onChange={(e) => onEdit(r.key, "premium", e.target.value)}
                    />
                  </div>
                </td>
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!val(r.key, "enabled", false)}
                    onChange={(e) => onEdit(r.key, "enabled", e.target.checked)}
                    aria-label={`Enable ${r.label}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .cfg-wrap{ overflow:auto; }
        .cfg{ width:100%; border-collapse:separate; border-spacing:0 10px; }
        thead th{
          font-size:12px; font-weight:600; opacity:.75; text-align:left; padding:0 10px;
        }
        tbody td{ padding:0 10px; }
        .pos{ font-weight:600; white-space:nowrap; }
        .prem{ display:flex; align-items:center; gap:8px; }
        .sym{ font-size:12px; opacity:.8; }
        input[type="checkbox"]{
          width:18px; height:18px; border-radius:6px;
        }
      `}</style>
    </section>
  );
}
