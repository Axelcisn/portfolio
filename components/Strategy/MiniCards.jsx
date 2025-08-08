"use client";
import { useState } from "react";

export default function MiniCards({ disabled, onRun, defaultHorizon = 30 }) {
  const [paths, setPaths] = useState(1000);
  const [horizon, setHorizon] = useState(defaultHorizon);
  const [source, setSource] = useState("capm_live");

  return (
    <section className="card">
      <h3>Monte Carlo</h3>
      <div className="grid grid-3">
        <div className="card"><div className="small">Paths</div>
          <input className="btn" type="number" min={100} step={100} value={paths} onChange={e => setPaths(parseInt(e.target.value || "0", 10))} />
        </div>
        <div className="card"><div className="small">Horizon (days)</div>
          <input className="btn" type="number" min={1} step={1} value={horizon} onChange={e => setHorizon(parseInt(e.target.value || "0", 10))} />
        </div>
        <div className="card"><div className="small">Drift/Vol Source</div>
          <select className="btn" value={source} onChange={e => setSource(e.target.value)}>
            <option value="capm_live">CAPM drift + Live IV</option>
            <option value="hist_hist">Historical drift + Historical vol</option>
            <option value="manual_manual">Manual drift + Manual vol</option>
          </select>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn" disabled={disabled} onClick={() => onRun?.({ paths, horizon, source })}>Run Simulation</button>
      </div>
    </section>
  );
}
