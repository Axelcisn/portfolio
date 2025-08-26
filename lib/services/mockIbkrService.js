// lib/services/mockIbkrService.js
// Mock IBKR service for local development when Gateway is not fully authenticated

const mockData = {
  AAPL: {
    symbol: 'AAPL',
    conid: '265598',
    name: 'Apple Inc.',
    exchange: 'NASDAQ',
    currency: 'USD',
    price: 230.54,
    bid: 230.52,
    ask: 230.56,
    high: 232.41,
    low: 228.88,
    close: 229.79,
    changePercent: 0.33,
    volume: 42568900,
    timestamp: Date.now()
  },
  GOOGL: {
    symbol: 'GOOGL',
    conid: '208813719',
    name: 'Alphabet Inc.',
    exchange: 'NASDAQ',
    currency: 'USD',
    price: 165.28,
    bid: 165.26,
    ask: 165.30,
    high: 166.82,
    low: 164.57,
    close: 164.89,
    changePercent: 0.24,
    volume: 18437200,
    timestamp: Date.now()
  },
  MSFT: {
    symbol: 'MSFT',
    conid: '272093',
    name: 'Microsoft Corporation',
    exchange: 'NASDAQ',
    currency: 'USD',
    price: 412.71,
    bid: 412.69,
    ask: 412.73,
    high: 415.18,
    low: 410.33,
    close: 411.67,
    changePercent: 0.25,
    volume: 15892100,
    timestamp: Date.now()
  }
};

export async function searchSymbols(query, limit = 10) {
  const results = Object.values(mockData)
    .filter(item => 
      item.symbol.includes(query.toUpperCase()) || 
      item.name.toLowerCase().includes(query.toLowerCase())
    )
    .slice(0, limit)
    .map(item => ({
      conid: item.conid,
      symbol: item.symbol,
      name: item.name,
      exchange: item.exchange,
      currency: item.currency,
      secType: 'STK'
    }));
  
  return results.length > 0 ? results : [{
    conid: '0',
    symbol: query.toUpperCase(),
    name: `${query} (Mock Data)`,
    exchange: 'MOCK',
    currency: 'USD',
    secType: 'STK'
  }];
}

export async function getQuote(symbol) {
  const sym = symbol.toUpperCase();
  const data = mockData[sym];
  
  if (data) {
    return data;
  }
  
  // Return mock data for any symbol
  return {
    symbol: sym,
    conid: null,
    name: `${sym} (Mock)`,
    exchange: 'MOCK',
    currency: 'USD',
    price: 100 + Math.random() * 100,
    bid: null,
    ask: null,
    high: null,
    low: null,
    close: 100,
    changePercent: (Math.random() - 0.5) * 5,
    volume: Math.floor(Math.random() * 10000000),
    timestamp: Date.now()
  };
}

export async function getHistoricalData(symbol, period = '1y', bar = '1d') {
  // Generate mock historical data
  const days = 30;
  const data = [];
  const basePrice = 100;
  
  for (let i = days; i >= 0; i--) {
    const time = Date.now() - (i * 24 * 60 * 60 * 1000);
    const variation = (Math.random() - 0.5) * 10;
    const close = basePrice + variation;
    
    data.push({
      time,
      open: close - Math.random() * 2,
      high: close + Math.random() * 2,
      low: close - Math.random() * 2,
      close,
      volume: Math.floor(Math.random() * 10000000)
    });
  }
  
  return data;
}

export async function getOptionsChain(symbol, expiry = null) {
  // Generate mock options data with proper numeric fields
  const spotPrice = 230.54;
  const strikes = [220, 225, 230, 235, 240, 245, 250];
  
  const generateOptions = (type) => {
    return strikes.map(strike => {
      const moneyness = type === 'call' ? Math.max(0, spotPrice - strike) : Math.max(0, strike - spotPrice);
      const isITM = moneyness > 0;
      const basePrice = Math.max(0.01, moneyness + (isITM ? 0 : Math.random() * 5));
      const spread = 0.05 + Math.random() * 0.10;
      
      return {
        strike: strike,
        price: Number((basePrice + Math.random() * 0.5).toFixed(2)),
        bid: Number((basePrice - spread/2).toFixed(2)),
        ask: Number((basePrice + spread/2).toFixed(2)),
        ivPct: Number((20 + Math.random() * 30).toFixed(2)), // IV between 20-50%
        openInterest: Math.floor(Math.random() * 10000),
        volume: Math.floor(Math.random() * 5000),
        last: Number((basePrice + (Math.random() - 0.5) * 0.2).toFixed(2))
      };
    });
  };
  
  return {
    symbol,
    underlyingConid: '0',
    expiries: ['20250919', '20250926', '20251017'],
    selectedExpiry: expiry || '20250919',
    calls: generateOptions('call'),
    puts: generateOptions('put'),
    timestamp: Date.now()
  };
}

export async function getOptionExpiries(symbol) {
  return ['20250919', '20250926', '20251017', '20251121', '20251219'];
}

export async function keepAlive() {
  return true;
}

export async function checkConnection() {
  return {
    connected: true,
    authenticated: true,
    competing: false,
    serverName: 'MOCK',
    cause: null,
    streams: {
      marketData: { connected: true },
      accountData: { connected: true }
    }
  };
}

export default {
  searchSymbols,
  getQuote,
  getHistoricalData,
  getOptionsChain,
  getOptionExpiries,
  keepAlive,
  checkConnection
};
