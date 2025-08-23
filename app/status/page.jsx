'use client';

import { useEffect, useState } from 'react';

export default function StatusPage() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [checkedAt, setCheckedAt] = useState(null);

  const load = async () => {
    try {
      const res = await fetch('/api/ibkr/health');
      const data = await res.json();
      setStatus(data);
      setError(null);
      setCheckedAt(new Date());
    } catch (err) {
      setError(err.message);
      setStatus(null);
      setCheckedAt(new Date());
    }
  };

  useEffect(() => {
    load();
  }, []);
  return (
    <div className="grid">
      <div className={`banner ${status ? (status.connected ? 'ok' : 'bad') : ''}`}>
        {status ? (status.connected ? "We're fully operational" : 'IBKR connection issues') : 'Checking status...'}
        {checkedAt && (
          <span className="checked-at">{checkedAt.toLocaleTimeString()}</span>
        )}
      </div>
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
              {!status.connected && status.cause && (
                <div className="cause">{status.cause}</div>
              )}
            </li>
            <li>
              <span className="label">Authenticated</span>
              <span className="value">{status.authenticated ? 'Yes' : 'No'}</span>
              {!status.authenticated && status.cause && (
                <div className="cause">{status.cause}</div>
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
        .banner {
          margin-bottom: 16px;
          padding: 12px 16px;
          border-radius: 8px;
          font-weight: 600;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .banner.ok {
          background: color-mix(in oklab, var(--positive) 15%, transparent);
          color: var(--positive);
        }
        .banner.bad {
          background: color-mix(in oklab, var(--negative) 15%, transparent);
          color: var(--negative);
        }
        .checked-at {
          font-size: 0.8rem;
          opacity: 0.7;
        }
        .card {
          padding: 20px;
          border-radius: 12px;
          background: color-mix(in oklab, var(--foreground) 5%, transparent);
        }
        .status-list { list-style: none; padding: 0; margin: 0; }
        .status-list li { margin-bottom: 16px; }
        .label { display: inline-block; width: 180px; font-weight: 500; }
        .value { font-weight: 600; }
        .cause { color: var(--negative); font-size: 0.8rem; margin-top: 4px; }
        .error { color: var(--negative); }
        .header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .indicator { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
        .refresh { margin-left: auto; }
      `}</style>
    </div>
  );
}

