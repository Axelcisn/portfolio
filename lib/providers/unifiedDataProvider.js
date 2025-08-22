/**
 * Unified Data Provider Service
 * 
 * This service provides a flexible interface for fetching various types of
 * financial data from multiple sources (IBKR, Yahoo Finance, etc.) with
 * automatic fallback mechanisms and caching.
 */

import { ibGet, getIbBridgeToken } from './ibBridge.js';

// Cache configuration
const CACHE_TTL = {
  quote: 10 * 1000,        // 10 seconds for real-time quotes
  dividend: 3600 * 1000,   // 1 hour for dividend data
  corporate: 86400 * 1000, // 24 hours for corporate actions
  fundamental: 3600 * 1000, // 1 hour for fundamentals
  volatility: 300 * 1000,  // 5 minutes for volatility
};

// Simple in-memory cache
const cache = new Map();

/**
 * Generic cache getter with TTL support
 */
function getCached(key, ttl) {
  const cached = cache.get(key);
  if (!cached) return null;
  
  const age = Date.now() - cached.timestamp;
  if (age > ttl) {
    cache.delete(key);
    return null;
  }
  
  return cached.data;
}

/**
 * Generic cache setter
 */
function setCached(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Data source prioritization
 */
const DATA_SOURCES = {
  IBKR: 'ibkr',
  YAHOO: 'yahoo',
  ALPHA_VANTAGE: 'alpha_vantage',
  IEX: 'iex',
  POLYGON: 'polygon',
};

/**
 * Base data fetcher with automatic retry and fallback
 */
class DataFetcher {
  constructor(dataType, sources = [DATA_SOURCES.IBKR, DATA_SOURCES.YAHOO]) {
    this.dataType = dataType;
    this.sources = sources;
  }

  async fetch(symbol, options = {}) {
    const cacheKey = `${this.dataType}:${symbol}:${JSON.stringify(options)}`;
    const ttl = CACHE_TTL[this.dataType] || 60000;
    
    // Check cache first
    const cached = getCached(cacheKey, ttl);
    if (cached && !options.noCache) {
      return { ...cached, source: 'cache' };
    }

    // Try each source in order
    let lastError = null;
    for (const source of this.sources) {
      try {
        const fetcher = this.getFetcher(source);
        if (!fetcher) continue;
        
        const data = await fetcher(symbol, options);
        if (data) {
          const result = { ...data, source, timestamp: Date.now() };
          setCached(cacheKey, result);
          return result;
        }
      } catch (error) {
        console.warn(`Failed to fetch ${this.dataType} from ${source}:`, error.message);
        lastError = error;
      }
    }

    // All sources failed
    throw new Error(`Failed to fetch ${this.dataType} for ${symbol}: ${lastError?.message || 'All sources failed'}`);
  }

  getFetcher(source) {
    // Override in subclasses
    return null;
  }
}

/**
 * Dividend Data Fetcher
 */
export class DividendFetcher extends DataFetcher {
  constructor() {
    super('dividend');
  }

  getFetcher(source) {
    switch (source) {
      case DATA_SOURCES.IBKR:
        return this.fetchFromIBKR.bind(this);
      case DATA_SOURCES.YAHOO:
        return this.fetchFromYahoo.bind(this);
      default:
        return null;
    }
  }

  async fetchFromIBKR(symbol, options = {}) {
    try {
      // First, get the contract ID
      const searchResult = await ibGet('/v1/search/symbols', { 
        params: { q: symbol, limit: 1 },
        timeoutMs: 3000 
      });
      
      if (!searchResult?.data?.length) {
        throw new Error('Symbol not found in IBKR');
      }
      
      const conid = searchResult.data[0].conid;
      
      // Fetch dividend data using IBKR's API
      const dividendData = await ibGet(`/v1/fundamentals/dividends`, {
        params: { conid, period: options.period || '1Y' },
        timeoutMs: 5000
      });

      return this.normalizeDividendData(dividendData, 'ibkr');
    } catch (error) {
      if (!getIbBridgeToken()) {
        throw new Error('IBKR connection not configured');
      }
      throw error;
    }
  }

  async fetchFromYahoo(symbol, options = {}) {
    const period = options.period || '1Y';
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?events=div&interval=1d&range=${period}`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store'
    });
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance API returned ${response.status}`);
    }
    
    const data = await response.json();
    const dividends = data?.chart?.result?.[0]?.events?.dividends || {};
    
    // Convert to array format
    const divArray = Object.entries(dividends).map(([timestamp, div]) => ({
      date: new Date(parseInt(timestamp) * 1000).toISOString(),
      amount: div.amount,
      ...div
    }));

    return this.normalizeDividendData(divArray, 'yahoo');
  }

  normalizeDividendData(data, source) {
    // Normalize data from different sources to a common format
    if (!data) return null;

    const normalized = {
      dividends: [],
      summary: {
        totalDividends: 0,
        annualYield: null,
        frequency: null,
        lastExDate: null,
        nextExDate: null
      }
    };

    if (source === 'yahoo') {
      normalized.dividends = data.map(div => ({
        exDate: div.date,
        paymentDate: div.date, // Yahoo doesn't provide payment date
        amount: div.amount,
        type: 'regular',
        currency: 'USD'
      }));
    } else if (source === 'ibkr') {
      // Adapt based on actual IBKR response structure
      normalized.dividends = Array.isArray(data) ? data : [];
    }

    // Calculate summary statistics
    if (normalized.dividends.length > 0) {
      normalized.summary.totalDividends = normalized.dividends.reduce((sum, div) => sum + (div.amount || 0), 0);
      normalized.summary.lastExDate = normalized.dividends[normalized.dividends.length - 1]?.exDate;
      
      // Estimate frequency based on dividend count
      const yearlyCount = normalized.dividends.length;
      if (yearlyCount >= 11) normalized.summary.frequency = 'monthly';
      else if (yearlyCount >= 3) normalized.summary.frequency = 'quarterly';
      else if (yearlyCount >= 1) normalized.summary.frequency = 'annual';
    }

    return normalized;
  }
}

/**
 * Corporate Actions Fetcher
 */
export class CorporateActionsFetcher extends DataFetcher {
  constructor() {
    super('corporate');
  }

  getFetcher(source) {
    switch (source) {
      case DATA_SOURCES.IBKR:
        return this.fetchFromIBKR.bind(this);
      case DATA_SOURCES.YAHOO:
        return this.fetchFromYahoo.bind(this);
      default:
        return null;
    }
  }

  async fetchFromIBKR(symbol, options = {}) {
    try {
      const searchResult = await ibGet('/v1/search/symbols', { 
        params: { q: symbol, limit: 1 },
        timeoutMs: 3000 
      });
      
      if (!searchResult?.data?.length) {
        throw new Error('Symbol not found in IBKR');
      }
      
      const conid = searchResult.data[0].conid;
      
      // Fetch corporate actions
      const actions = await ibGet(`/v1/fundamentals/corporate_actions`, {
        params: { conid, period: options.period || '5Y' },
        timeoutMs: 5000
      });

      return this.normalizeCorporateActions(actions, 'ibkr');
    } catch (error) {
      throw error;
    }
  }

  async fetchFromYahoo(symbol, options = {}) {
    const period = options.period || '5Y';
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?events=split&interval=1d&range=${period}`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store'
    });
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance API returned ${response.status}`);
    }
    
    const data = await response.json();
    const splits = data?.chart?.result?.[0]?.events?.splits || {};
    
    // Convert to array format
    const splitArray = Object.entries(splits).map(([timestamp, split]) => ({
      date: new Date(parseInt(timestamp) * 1000).toISOString(),
      type: 'split',
      ratio: `${split.numerator}:${split.denominator}`,
      ...split
    }));

    return this.normalizeCorporateActions(splitArray, 'yahoo');
  }

  normalizeCorporateActions(data, source) {
    if (!data) return null;

    const normalized = {
      actions: [],
      summary: {
        totalActions: 0,
        splits: [],
        mergers: [],
        spinoffs: [],
        other: []
      }
    };

    if (source === 'yahoo') {
      normalized.actions = data.map(action => ({
        date: action.date,
        type: action.type,
        description: action.type === 'split' ? `Stock split ${action.ratio}` : action.description,
        details: action
      }));
    } else if (source === 'ibkr') {
      // Adapt based on actual IBKR response
      normalized.actions = Array.isArray(data) ? data : [];
    }

    // Categorize actions
    normalized.actions.forEach(action => {
      normalized.summary.totalActions++;
      
      switch (action.type) {
        case 'split':
          normalized.summary.splits.push(action);
          break;
        case 'merger':
          normalized.summary.mergers.push(action);
          break;
        case 'spinoff':
          normalized.summary.spinoffs.push(action);
          break;
        default:
          normalized.summary.other.push(action);
      }
    });

    return normalized;
  }
}

/**
 * Fundamental Data Fetcher
 */
export class FundamentalsFetcher extends DataFetcher {
  constructor() {
    super('fundamental');
  }

  getFetcher(source) {
    switch (source) {
      case DATA_SOURCES.IBKR:
        return this.fetchFromIBKR.bind(this);
      case DATA_SOURCES.YAHOO:
        return this.fetchFromYahoo.bind(this);
      default:
        return null;
    }
  }

  async fetchFromIBKR(symbol, options = {}) {
    try {
      const searchResult = await ibGet('/v1/search/symbols', { 
        params: { q: symbol, limit: 1 },
        timeoutMs: 3000 
      });
      
      if (!searchResult?.data?.length) {
        throw new Error('Symbol not found in IBKR');
      }
      
      const conid = searchResult.data[0].conid;
      
      // Fetch fundamental data
      const fundamentals = await ibGet(`/v1/fundamentals/financials`, {
        params: { conid, period: options.period || 'annual' },
        timeoutMs: 5000
      });

      return this.normalizeFundamentals(fundamentals, 'ibkr');
    } catch (error) {
      throw error;
    }
  }

  async fetchFromYahoo(symbol, options = {}) {
    const urls = {
      profile: `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile,summaryProfile`,
      financials: `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=financialData,defaultKeyStatistics`,
      earnings: `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=earnings,earningsHistory`
    };

    const responses = await Promise.all(
      Object.entries(urls).map(async ([key, url]) => {
        try {
          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            cache: 'no-store'
          });
          
          if (!response.ok) return null;
          const data = await response.json();
          return { key, data: data?.quoteSummary?.result?.[0] || null };
        } catch {
          return null;
        }
      })
    );

    const combined = responses.reduce((acc, item) => {
      if (item?.data) acc[item.key] = item.data;
      return acc;
    }, {});

    return this.normalizeFundamentals(combined, 'yahoo');
  }

  normalizeFundamentals(data, source) {
    if (!data) return null;

    const normalized = {
      metrics: {},
      profile: {},
      financials: {},
      earnings: {}
    };

    if (source === 'yahoo') {
      // Extract key metrics
      const financialData = data.financials?.financialData || {};
      const keyStats = data.financials?.defaultKeyStatistics || {};
      
      normalized.metrics = {
        marketCap: financialData.marketCap?.raw || null,
        enterpriseValue: keyStats.enterpriseValue?.raw || null,
        peRatio: keyStats.trailingPE?.raw || null,
        pegRatio: keyStats.pegRatio?.raw || null,
        priceToBook: keyStats.priceToBook?.raw || null,
        debtToEquity: financialData.debtToEquity?.raw || null,
        returnOnEquity: financialData.returnOnEquity?.raw || null,
        returnOnAssets: financialData.returnOnAssets?.raw || null,
        profitMargin: financialData.profitMargins?.raw || null,
        operatingMargin: financialData.operatingMargins?.raw || null
      };

      // Company profile
      const profile = data.profile?.assetProfile || data.profile?.summaryProfile || {};
      normalized.profile = {
        sector: profile.sector || null,
        industry: profile.industry || null,
        employees: profile.fullTimeEmployees || null,
        description: profile.longBusinessSummary || null,
        website: profile.website || null
      };

      // Earnings data
      const earnings = data.earnings?.earnings || {};
      normalized.earnings = {
        quarterly: earnings.earningsChart?.quarterly || [],
        annual: earnings.financialsChart?.yearly || []
      };
    } else if (source === 'ibkr') {
      // Adapt based on actual IBKR response structure
      normalized.metrics = data.metrics || {};
      normalized.profile = data.profile || {};
      normalized.financials = data.financials || {};
      normalized.earnings = data.earnings || {};
    }

    return normalized;
  }
}

/**
 * Main Unified Data Provider
 */
export class UnifiedDataProvider {
  constructor() {
    this.fetchers = {
      dividend: new DividendFetcher(),
      corporate: new CorporateActionsFetcher(),
      fundamental: new FundamentalsFetcher()
    };
  }

  /**
   * Fetch any type of data with automatic source selection and fallback
   */
  async fetch(dataType, symbol, options = {}) {
    const fetcher = this.fetchers[dataType];
    if (!fetcher) {
      throw new Error(`Unknown data type: ${dataType}`);
    }

    return fetcher.fetch(symbol, options);
  }

  /**
   * Batch fetch multiple data types for a symbol
   */
  async fetchAll(symbol, dataTypes = ['dividend', 'corporate', 'fundamental'], options = {}) {
    const results = {};
    const errors = {};

    await Promise.all(
      dataTypes.map(async (type) => {
        try {
          results[type] = await this.fetch(type, symbol, options);
        } catch (error) {
          errors[type] = error.message;
          results[type] = null;
        }
      })
    );

    return { results, errors, symbol, timestamp: Date.now() };
  }

  /**
   * Clear cache for specific data type and symbol
   */
  clearCache(dataType = null, symbol = null) {
    if (!dataType && !symbol) {
      cache.clear();
    } else {
      for (const [key] of cache.entries()) {
        if ((!dataType || key.startsWith(dataType + ':')) &&
            (!symbol || key.includes(symbol))) {
          cache.delete(key);
        }
      }
    }
  }
}

// Export singleton instance
export const dataProvider = new UnifiedDataProvider();
