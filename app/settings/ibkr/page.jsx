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
        <div className="header">
          <h3>IBKR Connection</h3>
          <span
            className="indicator"
            style={{ backgroundColor: status?.connected ? '#3b82f6' : '#ef4444' }}
            title={status?.connected ? 'Connected' : 'Disconnected'}
          />
          <button type="button" onClick={load} className="refresh">Refresh</button>
        </div>
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
            {status.streams?.marketData && (
              <li>
                <span className="label">Market Data</span>
                <span className="value">{status.streams.marketData.connected ? 'Connected' : 'Disconnected'}</span>
                {!status.streams.marketData.connected && status.streams.marketData.cause && (
                  <div className="cause">{status.streams.marketData.cause}</div>
                )}
              </li>
            )}
            {status.streams?.accountData && (
              <li>
                <span className="label">Account Data</span>
                <span className="value">{status.streams.accountData.connected ? 'Connected' : 'Disconnected'}</span>
                {!status.streams.accountData.connected && status.streams.accountData.cause && (
                  <div className="cause">{status.streams.accountData.cause}</div>
                )}
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
        .header { display: flex; align-items: center; gap: 8px; }
        .indicator { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
        .refresh { margin-left: auto; }
      `}</style>
    </div>
  );
}

