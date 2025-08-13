"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import RomeClock from "./RomeClock";
import ThemeToggle from "./ThemeToggle";
import NavSearch from "./ui/NavSearch"; // ← fixed path

const items = [
  { href: "/", label: "Dashboard" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/strategy", label: "Strategy" }
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="navbar">
      <div className="nav-left">
        <span className="nav-title">Portfolio</span>
        <div className="nav-links">
          {items.map(i => (
            <Link
              key={i.href}
              href={i.href}
              className={`nav-link ${pathname === i.href ? "active" : ""}`}
            >
              {i.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="right">
        {/* Compact Apple-style search in the navbar */}
        <div className="nav-search" style={{ marginRight: 12 }}>
          <NavSearch />
        </div>
        <RomeClock />
        <ThemeToggle />
      </div>
    </nav>
  );
}
