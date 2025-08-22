// lib/providers/mockOptionsData.js
// Mock options data provider for development and testing
// Generates realistic options chains when IB API is unavailable

/**
 * Generate mock options chain data for a given symbol
 * @param {string} symbol - Stock symbol
 * @returns {object} Mock chain data in IB API format
 */
export function generateMockChain(symbol: string): any {
  const basePrice = getBasePrice(symbol);
  const expiries = generateExpiries();
  const options = expiries.map(expiry => generateOptionsForExpiry(expiry, basePrice));
  
  return {
    data: {
      spot: basePrice,
      underlyingPrice: basePrice,
      currency: getCurrency(symbol),
      expiries: expiries,
      expirationDates: expiries,
      options: options
    }
  };
}

/**
 * Get a realistic base price for common symbols
 */
function getBasePrice(symbol: string): number {
  const prices = {
    'META': 752.50,
    'AAPL': 178.50,
    'GOOGL': 142.80,
    'AMZN': 185.60,
    'MSFT': 412.30,
    'TSLA': 238.40,
    'NVDA': 125.80,
    'SPY': 545.20,
    'QQQ': 468.90,
    'IWM': 218.30
  };
  
  return prices[symbol.toUpperCase()] || 100.00;
}

/**
 * Get currency for symbol (EUR for European stocks, USD otherwise)
 */
function getCurrency(symbol: string): string {
  const eurSymbols = ['SAP', 'ASML', 'NVO', 'MC', 'OR'];
  return eurSymbols.includes(symbol.toUpperCase()) ? 'EUR' : 'USD';
}

/**
 * Generate realistic expiry dates
 */
function generateExpiries(): string[] {
  const expiries: string[] = [];
  const today = new Date();
  
  // Weekly expiries for the next 4 weeks
  for (let weeks = 1; weeks <= 4; weeks++) {
    const expiry = new Date(today);
    expiry.setDate(today.getDate() + (weeks * 7) - today.getDay() + 5); // Friday
    expiries.push(formatDate(expiry));
  }
  
  // Monthly expiries for the next 6 months
  for (let months = 1; months <= 6; months++) {
    const expiry = new Date(today);
    expiry.setMonth(today.getMonth() + months);
    // Third Friday of the month
    expiry.setDate(1);
    const firstDay = expiry.getDay();
    const thirdFriday = 15 + (5 - firstDay + 7) % 7;
    expiry.setDate(thirdFriday);
    
    // Only add if not already in weeklies
    const dateStr = formatDate(expiry);
    if (!expiries.includes(dateStr)) {
      expiries.push(dateStr);
    }
  }
  
  // Quarterly expiries
  const quarters = [3, 6, 9, 12];
  quarters.forEach(monthsAhead => {
    const expiry = new Date(today);
    expiry.setMonth(today.getMonth() + monthsAhead);
    expiry.setDate(1);
    const firstDay = expiry.getDay();
    const thirdFriday = 15 + (5 - firstDay + 7) % 7;
    expiry.setDate(thirdFriday);
    
    const dateStr = formatDate(expiry);
    if (!expiries.includes(dateStr)) {
      expiries.push(dateStr);
    }
  });
  
  return expiries.sort();
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Generate options for a specific expiry
 */
function generateOptionsForExpiry(expiry: string, basePrice: number): any {
  const strikes = generateStrikes(basePrice);
  const daysToExpiry = getDaysToExpiry(expiry);
  const annualizedTime = daysToExpiry / 365;
  
  const calls: any[] = [];
  const puts: any[] = [];
  
  strikes.forEach(strike => {
    const moneyness = strike / basePrice;
    const baseIV = 0.25; // 25% base implied volatility
    
    // Adjust IV for moneyness (volatility smile)
    const ivAdjustment = Math.abs(1 - moneyness) * 0.15;
    const iv = baseIV + ivAdjustment;
    
    // Calculate option prices using simplified Black-Scholes approximation
    const callPrice = calculateCallPrice(basePrice, strike, annualizedTime, iv);
    const putPrice = calculatePutPrice(basePrice, strike, annualizedTime, iv);
    
    // Generate bid-ask spreads
    const callSpread = callPrice * 0.02 + 0.01;
    const putSpread = putPrice * 0.02 + 0.01;
    
    calls.push({
      strike: strike,
      price: round(callPrice, 2),
      bid: round(callPrice - callSpread/2, 2),
      ask: round(callPrice + callSpread/2, 2),
      ivPct: round(iv * 100, 1),
      volume: Math.floor(Math.random() * 5000),
      openInterest: Math.floor(Math.random() * 10000),
      delta: calculateDelta('call', basePrice, strike, annualizedTime, iv),
      gamma: calculateGamma(basePrice, strike, annualizedTime, iv),
      theta: calculateTheta('call', basePrice, strike, annualizedTime, iv),
      vega: calculateVega(basePrice, strike, annualizedTime, iv),
      rho: calculateRho('call', strike, annualizedTime)
    });
    
    puts.push({
      strike: strike,
      price: round(putPrice, 2),
      bid: round(putPrice - putSpread/2, 2),
      ask: round(putPrice + putSpread/2, 2),
      ivPct: round(iv * 100, 1),
      volume: Math.floor(Math.random() * 3000),
      openInterest: Math.floor(Math.random() * 8000),
      delta: calculateDelta('put', basePrice, strike, annualizedTime, iv),
      gamma: calculateGamma(basePrice, strike, annualizedTime, iv),
      theta: calculateTheta('put', basePrice, strike, annualizedTime, iv),
      vega: calculateVega(basePrice, strike, annualizedTime, iv),
      rho: calculateRho('put', strike, annualizedTime)
    });
  });
  
  return {
    expiry: expiry,
    expiration: expiry,
    expirationDate: expiry,
    underlyingPrice: basePrice,
    calls: calls,
    puts: puts
  };
}

/**
 * Generate strike prices around the base price
 */
function generateStrikes(basePrice: number): number[] {
  const strikes: number[] = [];
  const strikeInterval = getStrikeInterval(basePrice);
  const numStrikes = 15; // Number of strikes on each side
  
  for (let i = -numStrikes; i <= numStrikes; i++) {
    const strike = round(basePrice + (i * strikeInterval), 0);
    if (strike > 0) {
      strikes.push(strike);
    }
  }
  
  return strikes;
}

/**
 * Get appropriate strike interval based on price
 */
function getStrikeInterval(price: number): number {
  if (price < 25) return 0.5;
  if (price < 50) return 1;
  if (price < 100) return 2.5;
  if (price < 250) return 5;
  if (price < 500) return 10;
  return 25;
}

/**
 * Calculate days to expiry
 */
function getDaysToExpiry(expiryDate: string): number {
  const today = new Date();
  const expiry = new Date(expiryDate);
  const diffTime = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

/**
 * Simplified Black-Scholes call price calculation
 */
function calculateCallPrice(S: number, K: number, T: number, sigma: number): number {
  const r = 0.05; // Risk-free rate
  
  if (T <= 0) return Math.max(0, S - K);
  
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  
  return S * Nd1 - K * Math.exp(-r * T) * Nd2;
}

/**
 * Simplified Black-Scholes put price calculation
 */
function calculatePutPrice(S: number, K: number, T: number, sigma: number): number {
  const r = 0.05; // Risk-free rate
  
  if (T <= 0) return Math.max(0, K - S);
  
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  const Nminusd1 = normalCDF(-d1);
  const Nminusd2 = normalCDF(-d2);
  
  return K * Math.exp(-r * T) * Nminusd2 - S * Nminusd1;
}

/**
 * Calculate delta
 */
function calculateDelta(type: string, S: number, K: number, T: number, sigma: number): number {
  if (T <= 0) return type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
  
  const d1 = (Math.log(S / K) + (0.05 + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const delta = type === 'call' ? normalCDF(d1) : normalCDF(d1) - 1;
  
  return round(delta, 3);
}

/**
 * Calculate gamma
 */
function calculateGamma(S: number, K: number, T: number, sigma: number): number {
  if (T <= 0) return 0;
  
  const d1 = (Math.log(S / K) + (0.05 + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const gamma = normalPDF(d1) / (S * sigma * Math.sqrt(T));
  
  return round(gamma, 4);
}

/**
 * Calculate theta
 */
function calculateTheta(type: string, S: number, K: number, T: number, sigma: number): number {
  if (T <= 0) return 0;
  
  const r = 0.05;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  const term1 = -(S * normalPDF(d1) * sigma) / (2 * Math.sqrt(T));
  
  let theta;
  if (type === 'call') {
    theta = term1 - r * K * Math.exp(-r * T) * normalCDF(d2);
  } else {
    theta = term1 + r * K * Math.exp(-r * T) * normalCDF(-d2);
  }
  
  // Convert to daily theta
  return round(theta / 365, 3);
}

/**
 * Calculate vega
 */
function calculateVega(S: number, K: number, T: number, sigma: number): number {
  if (T <= 0) return 0;
  
  const d1 = (Math.log(S / K) + (0.05 + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const vega = S * normalPDF(d1) * Math.sqrt(T) / 100; // Divide by 100 for 1% change
  
  return round(vega, 3);
}

/**
 * Calculate rho
 */
function calculateRho(type: string, K: number, T: number): number {
  if (T <= 0) return 0;
  
  const r = 0.05;
  const rho = type === 'call' 
    ? K * T * Math.exp(-r * T) / 100  // Divide by 100 for 1% change
    : -K * T * Math.exp(-r * T) / 100;
  
  return round(rho, 3);
}

/**
 * Normal cumulative distribution function
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2.0);
  
  const t = 1.0 / (1.0 + p * x);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;
  
  const y = 1.0 - (((((a5 * t5 + a4 * t4) + a3 * t3) + a2 * t2) + a1 * t) * Math.exp(-x * x));
  
  return 0.5 * (1.0 + sign * y);
}

/**
 * Normal probability density function
 */
function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Round to specified decimal places
 */
function round(value: number, decimals: number): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}
