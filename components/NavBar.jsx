// components/NavBar.jsx
"use client";

import React from "react";
import Link from "next/link";
import TickerSearchUnified from "./Search/TickerSearchUnified";

export default function NavBar({ onSearchSelect }) {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        background: "var(--nav-bg, #111)",
        color: "var(--nav-text, #fff)",
      }}
    >
      {/* Logo / Home Link */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/" style={{ fontWeight: 800, fontSize: 20, color: "inherit", textDecoration: "none" }}>
          MyApp
        </Link>
      </div>

      {/* Search */}
      <div style={{ flex: "0 1 400px", maxWidth: "50%" }}>
        <TickerSearchUnified
          onSelect={onSearchSelect}
          placeholder="Search companies, tickers..."
        />
      </div>

      {/* Right-side Nav Links */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <Link href="/about" style={{ color: "inherit", textDecoration: "none" }}>
          About
        </Link>
        <Link href="/contact" style={{ color: "inherit", textDecoration: "none" }}>
          Contact
        </Link>
      </div>
    </nav>
  );
}
