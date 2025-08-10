// components/Strategy/DirectionBadge.jsx
"use client";

export default function DirectionBadge({ value }) {
  const map = {
    Bullish: "good",
    Bearish: "bad",
    Neutral: "muted",
  };

  return (
    <span className={`dir-badge ${map[value] || "muted"}`} aria-label={`Direction: ${value}`}>
      {value || "—"}
    </span>
  );
}
