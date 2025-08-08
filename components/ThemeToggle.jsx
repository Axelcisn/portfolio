"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const has = document.documentElement.classList.contains("dark");
    setIsDark(has);
  }, []);

  const toggle = () => {
    const el = document.documentElement;
    const next = !el.classList.contains("dark");
    el.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setIsDark(next);
  };

  return (
    <button className="button" onClick={toggle} aria-label="Toggle theme">
      {isDark ? "Dark ●" : "Light ○"}
    </button>
  );
}
