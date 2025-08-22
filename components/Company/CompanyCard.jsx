// components/Company/CompanyCard.jsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";

// Exchange display names
const EXCHANGE_NAMES = {
  NMS: "NASDAQ", NGM: "NASDAQ GM", NCM: "NASDAQ CM",
  NYQ: "NYSE", ASE: "AMEX", PCX: "NYSE Arca",
  MIL: "Milan", LSE: "London", EBS: "Swiss", SWX: "Swiss",
  TOR: "Toronto", SAO: "São Paulo", BUE: "Buenos Aires",
  NASDAQ: "NASDAQ", NYSE: "NYSE", AMEX: "AMEX",
};

// Helper to extract price from various response formats
function extractPrice(data) {
  if (!data) return null;
  
  // Direct price fields
  const directPrice = data.price || data.lastPrice || data.last || data.spot || 
                      data.regularMarketPrice || data.currentPrice;
  if (directPrice && !isNaN(directPrice)) return Number(directPrice);
  
  // Nested structures
  if (data.quote) {
    const quotePrice = data.quote.price || data.quote.lastPrice || 
                       data.quote.regularMarketPrice || data.quote.last;
    if (quotePrice && !isNaN(quotePrice)) return Number(quotePrice);
  }
  
  // Chart data
  if (data.chart?.result?.[0]) {
    const meta = data.chart.result[0].meta;
    if (meta?.regularMarketPrice) return Number(meta.regularMarketPrice);
  }
  
  return null;
}

// Helper to extract previous close
function extractPrevClose(data) {
  if (!data) return null;
  
  const prevClose = data.previousClose || data.prevClose || 
                    data.regularMarketPreviousClose || data.chartPreviousClose;
  if (prevClose && !isNaN(prevClose)) return Number(prevClose);
  
  if (data.quote?.previousClose) return Number(data.quote.previousClose);
  if (data.meta?.previousClose) return Number(data.meta.previousClose);
  if (data.chart?.result?.[0]?.meta?.previousClose) {
    return Number(data.chart.result[0].meta.previousClose);
  }
  
  return null;
}

export default function CompanyCard({ symbol }) {
  const [companyData, setCompanyData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const lastSymbolRef = useRef("");
  const abortControllerRef = useRef(null);

  const fetchCompanyData = useCallback(async (sym) => {
    if (!sym || sym === lastSymbolRef.current) return;
    
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    lastSymbolRef.current = sym;
    
    setLoading(true);
    setError("");
    
    try {
      // Fetch company data from IBKR
      const response = await fetch(
        `/api/company?symbol=${encodeURIComponent(sym)}`,
        { 
          cache: "no-store",
          signal: controller.signal 
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch company data`);
      }
      
      const data = await response.json();
      
      // Extract company information
      const companyName = data.name || data.longName || data.companyName || 
                          data.shortName || sym;
      const exchange = data.exchange || data.exchangeName || data.primaryExchange || "";
      const exchangeDisplay = EXCHANGE_NAMES[exchange] || exchange;
      const currency = data.currency || data.ccy || "USD";
      
      // Extract price data
      const currentPrice = extractPrice(data);
      const previousClose = extractPrevClose(data);
      
      // Calculate change and change percentage
      let change = null;
      let changePercent = null;
      if (currentPrice && previousClose) {
        change = currentPrice - previousClose;
        changePercent = (change / previousClose) * 100;
      }
      
      // Get logo URL - try different patterns
      let logoUrl = null;
      if (sym) {
        // Try common logo API patterns
        logoUrl = `https://logo.clearbit.com/${sym.toLowerCase()}.com`;
        // You could also try: `https://storage.googleapis.com/iexcloud-hl37opg/api/logos/${sym}.png`
        // Or any other logo service you prefer
      }
      
      setCompanyData({
        symbol: sym,
        name: companyName,
        exchange: exchangeDisplay,
        currency: currency,
        price: currentPrice,
        change: change,
        changePercent: changePercent,
        previousClose: previousClose,
        logoUrl: logoUrl
      });
      
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error("Error fetching company:", err);
        setError(err.message || "Failed to load company data");
        setCompanyData(null);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  // Fetch data when symbol changes
  useEffect(() => {
    if (symbol && symbol.trim()) {
      fetchCompanyData(symbol.trim().toUpperCase());
    } else {
      setCompanyData(null);
      lastSymbolRef.current = "";
    }
  }, [symbol, fetchCompanyData]);

  // Poll for live updates
  useEffect(() => {
    if (!symbol || !companyData) return;
    
    const intervalId = setInterval(() => {
      // Silently update price in background
      fetch(`/api/ibkr/basic?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" })
        .then(res => res.json())
        .then(data => {
          const newPrice = extractPrice(data);
          if (newPrice && companyData.previousClose) {
            const newChange = newPrice - companyData.previousClose;
            const newChangePercent = (newChange / companyData.previousClose) * 100;
            
            setCompanyData(prev => ({
              ...prev,
              price: newPrice,
              change: newChange,
              changePercent: newChangePercent
            }));
          }
        })
        .catch(() => {}); // Silently fail for background updates
    }, 5000); // Update every 5 seconds
    
    return () => clearInterval(intervalId);
  }, [symbol, companyData?.previousClose]);

  // Empty state
  if (!symbol || (!companyData && !loading)) {
    return (
      <div className="company-card empty">
        <p>Enter a company name or ticker to get started</p>
        <style jsx>{`
          .company-card {
            padding: 24px;
            background: var(--card, #0b0b0c);
            border-radius: 12px;
            border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
          }
          .company-card.empty {
            text-align: center;
            color: color-mix(in srgb, var(--text) 50%, transparent);
            font-size: 14px;
            padding: 48px 24px;
          }
        `}</style>
      </div>
    );
  }

  // Loading state
  if (loading && !companyData) {
    return (
      <div className="company-card loading">
        <div className="skeleton-header">
          <div className="skeleton-logo"></div>
          <div className="skeleton-text">
            <div className="skeleton-line" style={{ width: "120px" }}></div>
            <div className="skeleton-line" style={{ width: "80px" }}></div>
          </div>
        </div>
        <style jsx>{`
          .company-card {
            padding: 24px;
            background: var(--card, #0b0b0c);
            border-radius: 12px;
            border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
          }
          .skeleton-header {
            display: flex;
            align-items: center;
            gap: 16px;
          }
          .skeleton-logo {
            width: 64px;
            height: 64px;
            border-radius: 12px;
            background: color-mix(in srgb, var(--text) 10%, transparent);
            animation: pulse 1.5s ease-in-out infinite;
          }
          .skeleton-text {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .skeleton-line {
            height: 20px;
            border-radius: 4px;
            background: color-mix(in srgb, var(--text) 10%, transparent);
            animation: pulse 1.5s ease-in-out infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  // Error state
  if (error && !companyData) {
    return (
      <div className="company-card error">
        <p>⚠️ {error}</p>
        <style jsx>{`
          .company-card {
            padding: 24px;
            background: var(--card, #0b0b0c);
            border-radius: 12px;
            border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
          }
          .company-card.error {
            text-align: center;
            color: #ef4444;
            font-size: 14px;
          }
        `}</style>
      </div>
    );
  }

  // Main company card display
  return (
    <div className="company-card">
      <div className="company-header">
        <div className="company-logo">
          {companyData.logoUrl ? (
            <img 
              src={companyData.logoUrl} 
              alt={companyData.symbol}
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
          ) : null}
          <div className="logo-fallback" style={{ display: companyData.logoUrl ? 'none' : 'flex' }}>
            {companyData.symbol?.[0] || '?'}
          </div>
        </div>
        
        <div className="company-info">
          <h2 className="company-name">{companyData.name}</h2>
          <div className="company-meta">
            <span className="company-symbol">{companyData.symbol}</span>
            {companyData.exchange && (
              <>
                <span className="separator">•</span>
                <span className="company-exchange">{companyData.exchange}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="price-section">
        <div className="price-main">
          <span className="price-value">
            {companyData.price ? companyData.price.toFixed(2) : '—'}
          </span>
          <span className="price-currency">{companyData.currency}</span>
        </div>
        
        {companyData.change !== null && companyData.changePercent !== null && (
          <div className={`price-change ${companyData.change >= 0 ? 'positive' : 'negative'}`}>
            <span className="change-value">
              {companyData.change >= 0 ? '+' : ''}{companyData.change.toFixed(2)}
            </span>
            <span className="change-percent">
              ({companyData.changePercent >= 0 ? '+' : ''}{companyData.changePercent.toFixed(2)}%)
            </span>
          </div>
        )}
      </div>

      {companyData.previousClose && (
        <div className="additional-info">
          <span className="info-label">Previous close:</span>
          <span className="info-value">{companyData.previousClose.toFixed(2)}</span>
        </div>
      )}

      <style jsx>{`
        .company-card {
          padding: 24px;
          background: var(--card, #0b0b0c);
          border-radius: 12px;
          border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
          transition: all 0.3s ease;
        }

        .company-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
        }

        .company-logo {
          position: relative;
          width: 64px;
          height: 64px;
          border-radius: 12px;
          overflow: hidden;
          background: color-mix(in srgb, var(--text) 8%, transparent);
        }

        .company-logo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .logo-fallback {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          font-weight: 600;
          color: var(--text);
          background: linear-gradient(135deg, 
            color-mix(in srgb, var(--accent, #3b82f6) 20%, transparent),
            color-mix(in srgb, var(--accent, #3b82f6) 10%, transparent)
          );
        }

        .company-info {
          flex: 1;
          min-width: 0;
        }

        .company-name {
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 4px 0;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .company-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: color-mix(in srgb, var(--text) 60%, transparent);
        }

        .company-symbol {
          font-weight: 500;
        }

        .separator {
          opacity: 0.5;
        }

        .company-exchange {
          opacity: 0.8;
        }

        .price-section {
          margin-bottom: 16px;
        }

        .price-main {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 8px;
        }

        .price-value {
          font-size: 36px;
          font-weight: 600;
          color: var(--text);
          line-height: 1;
        }

        .price-currency {
          font-size: 18px;
          color: color-mix(in srgb, var(--text) 60%, transparent);
          font-weight: 500;
        }

        .price-change {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 16px;
          font-weight: 500;
        }

        .price-change.positive {
          color: #10b981;
        }

        .price-change.negative {
          color: #ef4444;
        }

        .additional-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 16px;
          border-top: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
          font-size: 14px;
        }

        .info-label {
          color: color-mix(in srgb, var(--text) 50%, transparent);
        }

        .info-value {
          color: var(--text);
          font-weight: 500;
        }

        /* Responsive adjustments */
        @media (max-width: 480px) {
          .company-card {
            padding: 20px;
          }
          
          .company-logo {
            width: 56px;
            height: 56px;
          }
          
          .company-name {
            font-size: 18px;
          }
          
          .price-value {
            font-size: 32px;
          }
        }
      `}</style>
    </div>
  );
}
