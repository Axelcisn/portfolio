// components/Options/OptionsTab.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ChainTable from "./ChainTable";
import ChainSettings from "./ChainSettings";
import YahooHealthButton from "./YahooHealthButton";
import RefreshExpiriesButton from "./RefreshExpiriesButton";
import YahooHealthToaster from "./YahooHealthToaster";

/* ---------------- helpers ---------------- */
const normalizeExpiries = (xs) => {
  if (!Array.isArray(xs)) return [];
  const iso = xs
    .map((v) => {
      if (v instanceof Date) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, "0");
        const d = String(v.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
      const s = String(v || "").slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
    })
    .filter(Boolean);
  return Array.from(new Set(iso)).sort();
};
const pickNearest = (list) => {
  if (!list?.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  return list.find((e) => e >= today) || list[list.length - 1];
};
const monthLabelFor = (d) => {
  const y = d.getFullYear();
  const mIdx = d.getMonth();
  const labelMonth = d.toLocaleString(undefined, { month: "short" });
  return mIdx === 0 ? `${labelMonth} ’${String(y).slice(-2)}` : labelMonth;
};
const toSelFromIso = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d?.getTime())) return null;
  return { m: monthLabelFor(d), d: d.getDate(), iso };
};
const daysToExpiry = (iso, tz = "Europe/Rome") => {
  if (!iso) return null;
  try {
    const endLocal = new Date(`${iso}T23:59:59`).toLocaleString("en-US", { timeZone: tz });
    const end = new Date(endLocal);
    const now = new Date();
    return Math.max(1, Math.ceil((end - now) / 86400000));
  } catch { return null; }
};
const groupsFromIsoList = (isoList) => {
  if (!Array.isArray(isoList) || !isoList.length) return [];
  const parsed = isoList
    .map((iso) => {
      const d = new Date(iso);
      return Number.isFinite(d?.getTime()) ? { d, iso } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.d - b.d);

  const out = [];
  for (const { d, iso } of parsed) {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let g = out[out.length - 1];
    if (!g || g.k !== key) { g = { m: monthLabelFor(d), items: [], k: key }; out.push(g); }
    g.items.push({ day: d.getDate(), iso });
  }
  for (const g of out) {
    const seen = new Set();
    g.items = g.items
      .filter(({ day }) => (seen.has(day) ? false : (seen.add(day), true)))
      .sort((a, b) => a.day - b.day);
  }
  return out;
};

/* ===================================================================== */

export default function OptionsTab({
  symbol = "",
  currency = "USD",

  /* parent-controlled expiries */
  expiries = [],                 // string[] ISO
  selectedExpiry,                // ISO (controlled)
  onChangeExpiry,                // (iso) => void
  onDaysChange,                  // (days) => void
  loadingExpiries = false,       // boolean
  onRefreshExpiries,             // () => Promise<void> | void
}) {
  /* Provider & grouping */
  const [provider, setProvider] = useState("api");
  const [groupBy, setGroupBy] = useState("expiry");

  /* Chain settings (persist) */
  const SETTINGS_DEFAULT = useMemo(
    () => ({ showBy: "20", customRows: 25, sort: "asc", cols: { bid: true, ask: true, price: true } }),
    []
  );
  const [chainSettings, setChainSettings] = useState(SETTINGS_DEFAULT);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("chainSettings.v1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setChainSettings((prev) => ({
          ...prev,
          ...parsed,
          cols: { ...(prev.cols || {}), ...((parsed && parsed.cols) || {}) },
        }));
      }
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem("chainSettings.v1", JSON.stringify(chainSettings)); } catch {} }, [chainSettings]);
  const onToggleSort = () => setChainSettings((s) => ({ ...s, sort: s.sort === "asc" ? "desc" : "asc" }));

  /* Currency bridge */
  const [liveCurrency, setLiveCurrency] = useState(() => {
    try { return localStorage.getItem("company.lastCurrency") || currency; } catch { return currency; }
  });
  useEffect(() => { if (currency && currency !== liveCurrency) setLiveCurrency(currency); }, [currency]); // eslint-disable-line
  useEffect(() => {
    try {
      const stored = localStorage.getItem("company.lastCurrency");
      if (stored && stored !== liveCurrency) setLiveCurrency(stored);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);
  useEffect(() => {
    const onEvt = (e) => {
      const cur = e?.detail?.currency, sym = e?.detail?.symbol;
      if (cur && (!symbol || !sym || String(sym).toUpperCase() === String(symbol).toUpperCase())) {
        setLiveCurrency(cur);
      }
    };
    window.addEventListener("company-currency", onEvt);
    return () => window.removeEventListener("company-currency", onEvt);
  }, [symbol]);
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "company.lastCurrency") {
        const next = e.newValue || "";
        if (next && next !== liveCurrency) setLiveCurrency(next);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [liveCurrency]);

  /* -------------------- Expiries (parent-driven) -------------------- */
  const isoList = useMemo(() => normalizeExpiries(expiries), [expiries]);

  // Skeleton groups when empty
  const fallbackGroups = useMemo(
    () => [
      { m: "Aug", items: [15, 22, 29].map((d) => ({ day: d, iso: null })), k: "f-1" },
      { m: "Sep", items: [5, 12, 19, 26].map((d) => ({ day: d, iso: null })), k: "f-2" },
      { m: "Oct", items: [17].map((d) => ({ day: d, iso: null })), k: "f-3" },
      { m: "Nov", items: [21].map((d) => ({ day: d, iso: null })), k: "f-4" },
      { m: "Dec", items: [19].map((d) => ({ day: d, iso: null })), k: "f-5" },
      { m: "Jan ’26", items: [16].map((d) => ({ day: d, iso: null })), k: "f-6" },
      { m: "Feb", items: [20].map((d) => ({ day: d, iso: null })), k: "f-7" },
      { m: "Mar", items: [20].map((d) => ({ day: d, iso: null })), k: "f-8" },
      { m: "May", items: [15].map((d) => ({ day: d, iso: null })), k: "f-9" },
      { m: "Jun", items: [18].map((d) => ({ day: d, iso: null })), k: "f-10" },
    ],
    []
  );

  const groups = useMemo(() => {
    if (!isoList.length) return fallbackGroups;
    return groupsFromIsoList(isoList);
  }, [isoList, fallbackGroups]);

  /* -------------------- Selection (controlled/uncontrolled) -------------------- */
  const nearestIso = useMemo(() => pickNearest(isoList), [isoList]);

  const [selLocal, setSelLocal] = useState(() =>
    nearestIso ? toSelFromIso(nearestIso) : { m: "Jan ’26", d: 16, iso: null }
  );

  // Keep local selection valid when list changes (only if uncontrolled)
  useEffect(() => {
    if (selectedExpiry && isoList.includes(selectedExpiry)) return; // controlled externally
    if (!isoList.length) return;
    const valid = selLocal?.iso && isoList.includes(selLocal.iso);
    if (!valid) {
      const iso = nearestIso;
      if (iso) setSelLocal(toSelFromIso(iso));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isoList, nearestIso, selectedExpiry]);

  const controlledIso =
    selectedExpiry && isoList.includes(selectedExpiry) ? selectedExpiry : null;
  const sel = controlledIso ? toSelFromIso(controlledIso) : selLocal;

  const handlePick = (iso) => {
    if (!iso) return;
    if (controlledIso) onChangeExpiry?.(iso);
    else setSelLocal(toSelFromIso(iso));
  };

  // propagate DTE to parent
  useEffect(() => {
    const d = daysToExpiry(sel?.iso);
    if (d > 0) onDaysChange?.(d);
  }, [sel?.iso, onDaysChange]);

  /* -------------------- Settings portal -------------------- */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gearRef = useRef(null);
  const [anchorRect, setAnchorRect] = useState(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!settingsOpen || !gearRef.current) return;
    const update = () => setAnchorRect(gearRef.current.getBoundingClientRect());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [settingsOpen]);
  useEffect(() => {
    if (!settingsOpen) return;
    const onDocDown = (e) => {
      const pop = document.getElementById("chain-settings-popover");
      if (pop?.contains(e.target)) return;
      if (gearRef.current?.contains(e.target)) return;
      setSettingsOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setSettingsOpen(false); };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("touchstart", onDocDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("touchstart", onDocDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen]);

  /* -------------------- UI -------------------- */
  return (
    <section className="opt">
      <div className="toolbar">
        <div className="left">
          <button type="button" className={`pill ${provider === "api" ? "is-on" : ""}`} onClick={() => setProvider("api")} aria-pressed={provider === "api"}>API</button>
          <button type="button" className={`pill ${provider === "upload" ? "is-on" : ""}`} onClick={() => setProvider("upload")} aria-pressed={provider === "upload"}>Upload</button>
        </div>

        <div className="right">
          <button type="button" className={`seg ${groupBy === "expiry" ? "is-on" : ""}`} onClick={() => setGroupBy("expiry")}>By expiration</button>
          <button type="button" className={`seg ${groupBy === "strike" ? "is-on" : ""}`} onClick={() => setGroupBy("strike")}>By strike</button>

          <YahooHealthButton />
          <RefreshExpiriesButton
            onRefresh={onRefreshExpiries}
            busy={!!loadingExpiries}
            title="Refresh expiries (does not reset your selection)"
          />
          <button
            ref={gearRef}
            type="button"
            className="gear"
            aria-label="Chain table settings"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 8.8a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 0 0 0-6.4m8.94 3.2a7.2 7.2 0 0 0-.14-1.28l2.07-1.61l-2-3.46l-2.48.98a7.36 7.36 0 0 0-2.22-1.28L14.8 1h-5.6l-.37 3.35c-.79.28-1.53.7-2.22 1.28l-2.48-.98l-2 3.46l2.07 1.61c.1-.42.14-.85.14-1.28"
              />
            </svg>
          </button>
        </div>
      </div>

      <YahooHealthToaster />

      <div className="expiry-wrap">
        <div className="expiry" aria-busy={loadingExpiries ? "true" : "false"}>
          {(isoList.length ? groups : fallbackGroups).map((g) => (
            <div className="group" key={g.k || g.m}>
              <div className="m">{g.m}</div>
              <div className="days">
                {g.items.map((it) => {
                  const active = sel?.m === g.m && sel?.d === it.day;
                  const disabled = !it.iso; // only skeleton has no iso
                  return (
                    <button
                      key={`${g.k}-${it.day}-${it.iso || "x"}`}
                      className={`day ${active ? "is-active" : ""}`}
                      onClick={() => !disabled && handlePick(it.iso)}
                      aria-pressed={active}
                      disabled={disabled}
                      title={it.iso || "Loading…"}
                    >
                      {it.day}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ChainTable
        symbol={symbol}
        currency={liveCurrency}
        provider={provider}
        groupBy={groupBy}
        expiry={sel}
        settings={chainSettings}
        onToggleSort={onToggleSort}
      />

      {mounted && settingsOpen && anchorRect && createPortal(
        <div
          id="chain-settings-popover"
          className="popover"
          style={{
            position: "fixed",
            zIndex: 1000,
            top: Math.min(anchorRect.bottom + 8, window.innerHeight - 16),
            left: Math.min(Math.max(12, anchorRect.right - 360), window.innerWidth - 360 - 12),
            width: 360,
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Chain table settings"
        >
          <ChainSettings settings={chainSettings} onChange={setChainSettings} onClose={() => setSettingsOpen(false)} />
        </div>,
        document.body
      )}

      <style jsx>{`
        .opt { margin-top: 6px; }
        .toolbar{ display:flex; align-items:center; justify-content:space-between; gap:16px; margin: 6px 0 10px; }
        .left, .right{ display:flex; align-items:center; gap:10px; }

        .pill{ height:36px; padding:0 14px; border-radius:12px; border:1px solid var(--border); background:var(--card);
          font-weight:700; font-size:14px; line-height:1; color:var(--text); }
        .pill.is-on{ background: color-mix(in srgb, var(--accent, #3b82f6) 12%, var(--card));
          border-color: color-mix(in srgb, var(--accent, #3b82f6) 40%, var(--border)); }

        .seg{ height:38px; padding:0 16px; border-radius:14px; border:1px solid var(--border); background:var(--surface);
          font-weight:800; font-size:15px; color:var(--text); line-height:1; }
        .seg.is-on{ background: color-mix(in srgb, var(--accent, #3b82f6) 14%, var(--surface));
          border-color: color-mix(in srgb, var(--accent, #3b82f6) 40%, var(--border)); }

        .gear{ height:38px; width:42px; display:inline-flex; align-items:center; justify-content:center; border-radius:14px;
          border:1px solid var(--border); background:var(--card); color:var(--text); }

        .expiry-wrap{ margin: 14px 0 18px; padding: 2px 0 10px; border-bottom: 2px solid var(--border); }
        .expiry{ display:flex; align-items:flex-start; gap:28px; overflow-x:auto; overscroll-behavior-x: contain;
          -webkit-overflow-scrolling: touch; padding-bottom:6px; }
        .expiry[aria-busy="true"] { opacity:.75; }
        .expiry::-webkit-scrollbar{ height:6px; }
        .expiry::-webkit-scrollbar-thumb{ background:var(--border); border-radius:999px; }

        .group{ flex:0 0 auto; }
        .m{ font-weight:800; font-size:17px; letter-spacing:.2px; color:var(--text); padding:0 0 6px 0;
          border-bottom:1px solid var(--border); margin-bottom:8px; opacity:.95; }
        .days{ display:flex; gap:10px; }

        .day{ min-width:46px; height:34px; padding:0 10px; border-radius:12px; border:1px solid var(--border);
          background:var(--surface); font-weight:800; font-size:16px; color:var(--text); display:inline-flex; align-items:center;
          justify-content:center; transition: background .15s ease, transform .12s ease; }
        .day[disabled]{ opacity:.5; cursor:not-allowed; }
        .day:hover:not([disabled]){ background: color-mix(in srgb, var(--text) 6%, var(--surface)); transform: translateY(-1px); }
        .day.is-active{ background:var(--text); color:var(--bg); border-color:var(--text); }

        @media (max-width: 840px){
          .seg{ height:36px; padding:0 14px; font-size:14px; }
          .m{ font-size:16px; }
          .day{ height:32px; min-width:42px; font-size:15px; }
        }
      `}</style>
    </section>
  );
}
