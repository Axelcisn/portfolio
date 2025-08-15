// components/Strategy/hooks/useBreakeven.js
import { useEffect, useMemo, useRef, useState } from "react";

/** Convert builder rows -> BE API legs */
export function rowsToApiLegs(rows = []) {
  const legs = [];
  for (const r of rows || []) {
    if (!r?.enabled) continue;
    const t = String(r.type || "").toLowerCase();
    const qty = Number.isFinite(Number(r.qty)) ? Math.max(0, Number(r.qty)) : 1;
    const strike = Number(r.K);
    const premium = Number.isFinite(Number(r.premium)) ? Number(r.premium) : undefined;

    if (!Number.isFinite(strike) && t !== "ls" && t !== "ss") continue;

    if (t === "lc") legs.push({ type: "call", side: "long",  strike, premium, qty });
    else if (t === "sc") legs.push({ type: "call", side: "short", strike, premium, qty });
    else if (t === "lp") legs.push({ type: "put",  side: "long",  strike, premium, qty });
    else if (t === "sp") legs.push({ type: "put",  side: "short", strike, premium, qty });
    else if (t === "ls") legs.push({ type: "stock", side: "long",  price: Number(r.K), qty });
    else if (t === "ss") legs.push({ type: "stock", side: "short", price: Number(r.K), qty });
  }
  return legs;
}

/**
 * Fetch break-evens for the given rows/strategy.
 * Always returns { be|null, meta|null, loading:boolean, error:string|null }.
 */
export default function useBreakeven({ rows, strategy, contractSize = 1 }) {
  const legs = useMemo(() => rowsToApiLegs(rows), [rows]);
  const [state, setState] = useState({ be: null, meta: null, loading: false, error: null });

  const abortRef = useRef(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!legs.length) {
      setState({ be: null, meta: null, loading: false, error: null });
      return;
    }
    try { abortRef.current?.abort(); } catch {}
    const ac = new AbortController();
    abortRef.current = ac;
    const mySeq = ++seqRef.current;

    setState(s => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        const res = await fetch("/api/strategy/breakeven", {
          method: "POST",
          signal: ac.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategy, legs, contractSize }),
        });
        const j = await res.json().catch(() => ({}));
        if (ac.signal.aborted || mySeq !== seqRef.current) return;

        const be = Array.isArray(j?.be) ? j.be : null;
        const meta = j?.meta ?? null;

        setState({
          be: be && be.length ? be : null,
          meta,
          loading: false,
          error: null,
        });
      } catch (e) {
        if (!ac.signal.aborted) {
          setState({ be: null, meta: null, loading: false, error: String(e?.message || e) });
        }
      }
    })();

    return () => { try { abortRef.current?.abort(); } catch {} };
  }, [strategy, contractSize, legs]);

  return { ...state, legs };
}
