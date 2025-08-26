// lib/services/customBridgeService.js
// Custom bridge service for the TWS bridge API with /optionChain endpoint

/**
 * Get the bridge URL from environment variables
 */
function getBridgeUrl() {
  // Check multiple possible env vars
  const url = process.env.IB_BRIDGE_URL || 
              process.env.NEXT_PUBLIC_BRIDGE_URL || 
              process.env.NEXT_PUBLIC_TWS_BRIDGE_URL ||
              'http://127.0.0.1:8788';
  
  return url.replace(/\/$/, ''); // Remove trailing slash
}

/**
 * Make a request to the bridge API
 */
async function bridgeRequest(endpoint, params = {}) {
  const baseUrl = getBridgeUrl();
  const url = new URL(`${baseUrl}${endpoint}`);
  
  // Add query parameters
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      url.searchParams.append(key, value);
    }
  });
  
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Bridge API error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Bridge request failed for ${endpoint}:`, error.message);
    throw error;
  }
}

/**
 * Get options chain from the bridge
 * @param {string} symbol - Stock symbol
 * @param {number} window - Number of strikes around ATM (optional)
 * @returns {Promise<Object>} Options chain data
 */
export async function getOptionsChain(symbol, window = 3) {
  if (!symbol) {
    throw new Error('Symbol required');
  }
  
  try {
    const data = await bridgeRequest('/optionChain', { 
      symbol: symbol.toUpperCase(),
      window: window 
    });
    
    // Transform the bridge data to match our expected format
    // The bridge returns arrays of options with null values for market data
    // We need to transform to our standard format with numeric fields
    
    const transformOption = (opt) => {
      // Convert null to 0 for numeric fields, keep actual values if present
      return {
        strike: opt.strike || 0,
        price: opt.last !== null && opt.last !== undefined ? Number(opt.last) : 0,
        bid: opt.bid !== null && opt.bid !== undefined ? Number(opt.bid) : 0,
        ask: opt.ask !== null && opt.ask !== undefined ? Number(opt.ask) : 0,
        ivPct: opt.impliedVol !== null && opt.impliedVol !== undefined ? Number(opt.impliedVol) * 100 : 0, // Convert to percentage
        openInterest: opt.openInterest !== null && opt.openInterest !== undefined ? Number(opt.openInterest) : 0,
        volume: opt.volume !== null && opt.volume !== undefined ? Number(opt.volume) : 0,
        conid: opt.conid
      };
    };
    
    return {
      symbol: symbol.toUpperCase(),
      calls: (data.calls || []).map(transformOption),
      puts: (data.puts || []).map(transformOption),
      expiry: data.expiry || null,
      expiries: data.expiries || [],
      timestamp: Date.now()
    };
  } catch (error) {
    throw new Error(`Failed to get options chain for ${symbol}: ${error.message}`);
  }
}

/**
 * Get quote data from the bridge (if available)
 * @param {string} symbol - Stock symbol
 * @returns {Promise<Object>} Quote data
 */
export async function getQuote(symbol) {
  if (!symbol) {
    throw new Error('Symbol required');
  }
  
  try {
    // Try to get quote from bridge if it has that endpoint
    const data = await bridgeRequest('/quote', { symbol: symbol.toUpperCase() });
    
    return {
      symbol: symbol.toUpperCase(),
      price: data.price || data.last || 0,
      bid: data.bid || 0,
      ask: data.ask || 0,
      currency: data.currency || 'USD'
    };
  } catch (error) {
    // If quote endpoint doesn't exist, return minimal data
    console.warn(`Quote endpoint not available for ${symbol}, using defaults`);
    return {
      symbol: symbol.toUpperCase(),
      price: 0,
      bid: 0,
      ask: 0,
      currency: 'USD'
    };
  }
}

/**
 * Check if the bridge is connected and healthy
 * @returns {Promise<Object>} Connection status
 */
export async function checkConnection() {
  try {
    const data = await bridgeRequest('/health');
    return {
      connected: data.ok === true,
      ibConnected: data.ibConnected || false,
      host: data.host || null,
      port: data.port || null
    };
  } catch (error) {
    return {
      connected: false,
      ibConnected: false,
      error: error.message
    };
  }
}

export default {
  getOptionsChain,
  getQuote,
  checkConnection
};
