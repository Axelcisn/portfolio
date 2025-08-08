"use client";
export default function LegRow({ label, enabled, onEnabled, strike, premium, qty, onChange }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: "120px 1fr 1fr 1fr" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={enabled} onChange={e => onEnabled?.(e.target.checked)} />
        <strong>{label}</strong>
      </div>
      <input className="btn" placeholder="Strike" value={strike} onChange={e => onChange?.({ strike: e.target.value })} />
      <input className="btn" placeholder="Premium" value={premium} onChange={e => onChange?.({ premium: e.target.value })} />
      <input className="btn" placeholder="Qty" type="number" value={qty} onChange={e => onChange?.({ qty: e.target.value })} />
    </div>
  );
}
