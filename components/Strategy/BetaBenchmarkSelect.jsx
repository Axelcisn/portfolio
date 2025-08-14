// components/Strategy/BetaBenchmarkSelect.jsx
// Desktop-first, minimal visual weight. No layout changes implied.
//
// Notes (LaTeX):
// • Beta definition: \beta = \dfrac{\operatorname{Cov}(R_s, R_m)}{\operatorname{Var}(R_m)}
// • Choose a broad-market benchmark that best represents systematic risk.

import React from 'react';

/**
 * BetaBenchmarkSelect
 * Props:
 *  - value?: string                  current Yahoo symbol (e.g., "^GSPC")
 *  - onChange?: (symbol: string) => void
 *  - id?: string                     optional input id
 *  - label?: string                  optional label (defaults to "Benchmark")
 *  - options?: Array<{label: string, value: string}>
 *
 * Default options cover major indices with their Yahoo symbols.
 */
export default function BetaBenchmarkSelect({
  value,
  onChange,
  id = 'beta-benchmark',
  label = 'Benchmark',
  options,
}) {
  const defaultOptions = [
    { label: 'S&P 500 (SPX)', value: '^GSPC' },
    { label: 'NASDAQ 100 (NDX)', value: '^NDX' },
    { label: 'Dow Jones (DJI)', value: '^DJI' },
    { label: 'Russell 2000 (RUT)', value: '^RUT' },
    { label: 'STOXX Europe 600 (STOXX)', value: '^STOXX' },
    { label: 'EURO STOXX 50 (SX5E)', value: '^SX5E' },
    { label: 'FTSE 100 (FTSE)', value: '^FTSE' },
    { label: 'Nikkei 225 (N225)', value: '^N225' },
    { label: 'SMI Switzerland (SSMI)', value: '^SSMI' },
    { label: 'TSX Composite (GSPTSE)', value: '^GSPTSE' },
  ];

  const opts = Array.isArray(options) && options.length ? options : defaultOptions;

  return (
    <div className="beta-benchmark-select" style={{ display: 'grid', gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 12, color: 'var(--muted-foreground, #6b7280)' }}>
        {label}
      </label>
      <select
        id={id}
        value={value ?? opts[0].value}
        onChange={(e) => onChange && onChange(e.target.value)}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          padding: '10px 12px',
          borderRadius: 12,
          border: '1px solid var(--border, #e5e7eb)',
          background: 'var(--card, #ffffff)',
          color: 'var(--foreground, #111827)',
          fontSize: 14,
          lineHeight: '20px',
          outline: 'none',
          transition: 'border-color 120ms ease',
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--ring, #9ca3af)')}
        onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border, #e5e7eb)')}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div
        style={{
          fontSize: 11,
          color: 'var(--muted-foreground, #6b7280)',
          userSelect: 'none',
        }}
        aria-hidden="true"
      >
        Choose the market index used for \u03B2 regression.
      </div>
    </div>
  );
}
