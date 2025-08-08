"use client";
import { useEffect, useState } from "react";

/* simple sun/moon icons */
function Sun({ color = "#000" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4.5" stroke={color} strokeWidth="1.6" />
      <g stroke={color} strokeWidth="1.6" strokeLinecap="round">
        <path d="M12 2.5v3.2M12 18.3v3.2M21.5 12h-3.2M5.7 12H2.5M18.4 18.4l-2.3-2.3M7.9 7.9L5.6 5.6M18.4 5.6l-2.3 2.3M7.9 16.1l-2.3 2.3"/>
      </g>
    </svg>
  );
}
function Moon({ color = "#fff" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M21 13.5A8.5 8.5 0 0 1 10.5 3 8.8 8.8 0 1 0 21 13.5Z" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);
  const [isDaytime, setIsDaytime] = useState(true);

  // evaluate local time once and every hour
  useEffect(() => {
    const evalTime = () => {
      const h = new Date().getHours();
      setIsDaytime(h >= 7 && h < 19);
    };
    evalTime();
    const t = setInterval(evalTime, 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const el = document.documentElement;
    const next = !el.classList.contains("dark");
    el.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setIsDark(next);
  };

  // icon color: black on light (day), white on dark (night)
  const iconColor = isDark || !isDaytime ? "#fff" : "#000";

  return (
    <button
      className="toggle"
      onClick={toggle}
      title="Toggle dark mode"
      aria-label="Toggle dark mode"
    >
      {isDark ? <Moon color={iconColor} /> : <Sun color={iconColor} />}
    </button>
  );
}
