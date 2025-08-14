"use client";

// Desktop-first, minimal visual weight, night-mode aware.
// Notes (LaTeX):
// • \beta = \dfrac{\operatorname{Cov}(R_s, R_m)}{\operatorname{Var}(R_m)}

export default function BetaBenchmarkSelect({
  value,
  onChange,
  id = "beta-benchmark",
  label = "Benchmark (β)",
  showLabel = false,          // NEW: do not render an internal label by default
  options,
  className = "",
}) {
  const defaultOptions = [
    { label: "S&P 500 (SPX)", value: "^GSPC" },
    { label: "NASDAQ 100 (NDX)", value: "^NDX" },
    { label: "Dow Jones (DJI)", value: "^DJI" },
    { label: "Russell 2000 (RUT)", value: "^RUT" },
    { label: "STOXX Europe 600 (STOXX)", value: "^STOXX" },
    { label: "EURO STOXX 50 (SX5E)", value: "^SX5E" },
    { label: "FTSE 100 (FTSE)", value: "^FTSE" },
    { label: "Nikkei 225 (N225)", value: "^N225" },
    { label: "SMI Switzerland (SSMI)", value: "^SSMI" },
    { label: "TSX Composite (GSPTSE)", value: "^GSPTSE" },
  ];

  const opts = Array.isArray(options) && options.length ? options : defaultOptions;
  const current = value ?? opts[0].value;

  return (
    <div className={`beta-select ${className}`}>
      {showLabel && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}

      <div className="selectWrap">
        <select
          id={id}
          value={current}
          onChange={(e) => onChange && onChange(e.target.value)}
          className="select"
          aria-label={showLabel ? undefined : "Benchmark for beta"}
        >
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="chev" aria-hidden>▾</span>
      </div>

      <style jsx>{`
        .beta-select {
          display: grid;
          gap: 6px;
        }
        .label {
          font-size: 12px;
          color: var(--muted-foreground, #6b7280);
        }
        .selectWrap {
          position: relative;
          display: inline-block;
          width: 100%;
        }
        .select {
          width: 100%;
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          padding: 10px 32px 10px 12px;
          border-radius: 12px;
          border: 1px solid var(--border, #2a2f3a);
          background: var(--card, #111214);
          color: var(--foreground, #e5e7eb);
          font-size: 14px;
          line-height: 20px;
          outline: none;
          transition: border-color 140ms ease, box-shadow 140ms ease, transform 120ms ease;
        }
        .select:hover {
          border-color: var(--ring, #3b3f47);
        }
        .select:focus {
          border-color: var(--ring, #9ca3af);
          box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.18);
        }
        .select:active {
          transform: translateY(0.5px);
        }
        .chev {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
          font-size: 12px;
          color: var(--muted-foreground, #9aa1ac);
        }

        /* Light mode fallback if tokens differ */
        @media (prefers-color-scheme: light) {
          .select {
            border: 1px solid var(--border, #e5e7eb);
            background: var(--card, #ffffff);
            color: var(--foreground, #111827);
          }
          .select:hover {
            border-color: var(--ring, #a3a3a3);
          }
          .chev {
            color: var(--muted-foreground, #6b7280);
          }
        }
      `}</style>
    </div>
  );
}
