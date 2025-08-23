'use client';

import { useEffect, useState } from 'react';

export default function IbkrSettings() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const res = await fetch('/api/ibkr/health');
      const data = await res.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      setStatus(null);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="grid">
      <section className="card">
        <h3>IBKR Connection</h3>
        {status ? (
          <ul className="status-list">
            <li>
              <span className="label">Gateway</span>
              <span className="value">{status.connected ? 'Connected' : 'Disconnected'}</span>
              {!status.connected && (status.error || status.fail) && (
                <div className="cause">{status.error || status.fail}</div>
              )}
            </li>
            <li>
              <span className="label">Authenticated</span>
              <span className="value">{status.authenticated ? 'Yes' : 'No'}</span>
              {!status.authenticated && status.fail && (
                <div className="cause">{status.fail}</div>
              )}
            </li>
            <li>
              <span className="label">Competing Session</span>
              <span className="value">{status.competing ? 'Yes' : 'No'}</span>
            </li>
            {status.serverName && (
              <li>
                <span className="label">Server</span>
                <span className="value">{status.serverName}</span>
              </li>
            )}
          </ul>
        ) : error ? (
          <div className="error">Error loading status: {error}</div>
        ) : (
          <div>Loading...</div>
        )}
      </section>
      <style jsx>{`
        .status-list { list-style: none; padding: 0; margin: 0; }
        .status-list li { margin-bottom: 12px; }
        .label { display: inline-block; width: 160px; }
        .cause { color: var(--negative); font-size: 0.85rem; margin-top: 4px; }
        .error { color: var(--negative); }
      `}</style>
    </div>
  );
}

