"use client";
export default function LegRow({ label, enabled, onEnabled, strike, premium, qty, onChange }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: "160px 1fr 1fr 1fr" }}>
      <div className="row">
        <input type="checkbox" checked={enabled} onChange={e => onEnabled?.(e.target.checked)} />
        <strong>{label}</strong>
      </div>
      <input className="field" placeholder="Strike" value={strike} onChange={e => onChange?.({ strike: e.target.value })} />
      <input className="field" placeholder="Premium" value={premium} onChange={e => onChange?.({ premium: e.target.value })} />
      <input className="field" placeholder="Qty" type="number" value={qty} onChange={e => onChange?.({ qty: e.target.value })} />
    </div>
  );
}
