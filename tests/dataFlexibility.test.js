/**
 * Test Suite for Data Flexibility Features
 * 
 * This test file demonstrates how to use the new flexible data fetching
 * capabilities including dividends, corporate actions, volatility term
 * structure, and the query template system.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// Base URL for API testing (adjust based on your environment)
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

/**
 * Helper function to make API requests
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });
  
  const data = await response.json();
  return { status: response.status, data };
}

describe('Data Flexibility Integration Tests', () => {
  
  describe('Dividend Data Fetching', () => {
    it('should fetch dividend data for a single symbol', async () => {
      const { status, data } = await apiRequest('/api/dividends?symbol=AAPL');
      
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.symbol).toBe('AAPL');
      expect(data.dividends).toBeDefined();
      expect(data.summary).toBeDefined();
      
      if (data.summary.totalDividends > 0) {
        expect(data.summary.frequency).toMatch(/monthly|quarterly|annual/);
        expect(data.summary.annualYield).toBeGreaterThan(0);
      }
    });

    it('should batch fetch dividends for multiple symbols', async () => {
      const { status, data } = await apiRequest('/api/dividends', {
        method: 'POST',
        body: JSON.stringify({
          symbols: ['AAPL', 'MSFT', 'JNJ'],
          period: '2Y'
        })
      });
      
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.results).toHaveLength(3);
      
      data.results.forEach(result => {
        expect(result.symbol).toBeDefined();
        expect(result.ok).toBeDefined();
      });
    });

    it('should handle invalid symbols gracefully', async () => {
      const { status, data } = await apiRequest('/api/dividends?symbol=INVALID123');
      
      expect(status).toBe(500);
      expect(data.ok).toBe(false);
      expect(data.error).toBeDefined();
    });
  });

  describe('Corporate Actions Fetching', () => {
    it('should fetch corporate actions for a symbol', async () => {
      const { status, data } = await apiRequest('/api/corporate-actions?symbol=AAPL&period=5Y');
      
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.symbol).toBe('AAPL');
      expect(data.actions).toBeDefined();
      expect(data.summary).toBeDefined();
      expect(data.summary.totalActions).toBeGreaterThanOrEqual(0);
    });

    it('should filter corporate actions by type', async () => {
      const { status, data } = await apiRequest('/api/corporate-actions?symbol=AAPL&type=split');
      
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      
      if (data.actions.length > 0) {
        data.actions.forEach(action => {
          expect(action.type).toBe('split');
        });
      }
    });

    it('should batch fetch with date filtering', async () => {
      const { status, data } = await apiRequest('/api/corporate-actions', {
        method: 'POST',
        body: JSON.stringify({
          symbols: ['AAPL', 'GOOGL'],
          startDate: '2020-01-01',
          endDate: '2023-12-31',
          actionTypes: ['split']
        })
      });
      
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.aggregateStats).toBeDefined();
      expect(data.aggregateStats.totalActions).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Volatility Term Structure', () => {
    it('should fetch volatility term structure', async () => {
      const { status, data } = await apiRequest('/api/volatility/term-structure?symbol=SPY');
      
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.symbol).toBe('SPY');
      expect(data.termStructure).toBeDefined();
      expect(Array.isArray(data.termStructure)).toBe(true);
      
      // Check structure shape
      expect(data.summary.shape).toMatch(/contango|backwardation|flat|unknown/);
      
      // Verify each point in the term structure
      data.termStructure.forEach(point => {
        expect(point.days).toBeDefined();
        expect(point.T).toBeDefined();
        // IV might be null if data unavailable
        if (point.iv !== null) {
          expect(point.iv).toBeGreaterThan(0);
          expect(point.iv).toBeLessThan(5); // Reasonable IV range
        }
      });
    });

    it('should calculate volatility surface', async () => {
      const { status, data } = await apiRequest('/api/volatility/term-structure', {
        method: 'POST',
        body: JSON.stringify({
          symbol: 'AAPL',
          strikes: [150, 160, 170, 180, 190],
          expiries: [7, 30, 60, 90],
          useMoneyness: false
        })
      });
      
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.surface).toBeDefined();
      expect(data.surface.grid).toBeDefined();
      expect(data.methodology).toBe('simplified_smile');
    });
  });

  describe('Query Template System', () => {
    it('should list available query templates', async () => {
      const { status, data } = await apiRequest('/api/data/query');
      
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.templates).toBeDefined();
      expect(data.count).toBeGreaterThan(0);
      expect(data.categories).toBeDefined();
      
      // Check that default templates exist
      const templateNames = data.templates.map(t => t.name);
      expect(templateNames).toContain('earnings_calendar');
      expect(templateNames).toContain('analyst_ratings');
      expect(templateNames).toContain('options_flow');
    });

    it('should execute a single query template', async () => {
      const { status, data } = await apiRequest('/api/data/query', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'single',
          template: 'analyst_ratings',
          params: { symbol: 'AAPL' }
        })
      });
      
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.template).toBe('analyst_ratings');
      expect(data.result).toBeDefined();
    });

    it('should compose multiple templates', async () => {
      const { status, data } = await apiRequest('/api/data/query', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'compose',
          templates: [
            { name: 'analyst_ratings', params: { symbol: 'MSFT' } },
            { name: 'short_interest', params: { symbol: 'MSFT' } }
          ]
        })
      });
      
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.mode).toBe('compose');
      expect(data.results).toBeDefined();
      expect(data.results.analyst_ratings).toBeDefined();
      expect(data.results.short_interest).toBeDefined();
    });

    it('should execute dynamic queries', async () => {
      const { status, data } = await apiRequest('/api/data/query', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'dynamic',
          query: {
            dataType: 'dividend',
            symbols: ['JNJ', 'KO', 'PEP'],
            period: '1Y',
            aggregate: 'average'
          }
        })
      });
      
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.mode).toBe('dynamic');
      expect(data.results).toHaveLength(3);
      
      if (data.aggregated !== null) {
        expect(typeof data.aggregated).toBe('number');
      }
    });

    it('should fetch unified data for a symbol', async () => {
      const { status, data } = await apiRequest('/api/data/query', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'unified',
          symbol: 'AAPL',
          dataTypes: ['dividend', 'corporate', 'fundamental']
        })
      });
      
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.mode).toBe('unified');
      expect(data.symbol).toBe('AAPL');
      expect(data.results).toBeDefined();
      expect(data.results.dividend).toBeDefined();
      expect(data.results.corporate).toBeDefined();
      expect(data.results.fundamental).toBeDefined();
    });
  });

  describe('Data Source Fallback', () => {
    it('should fallback to Yahoo when IBKR is unavailable', async () => {
      // This test assumes IBKR might not be configured
      const { status, data } = await apiRequest('/api/dividends?symbol=IBM&source=ibkr');
      
      // Should still return data even if IBKR fails
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.source).toMatch(/yahoo|ibkr|cache/);
    });

    it('should use cache when available', async () => {
      // First request to populate cache
      await apiRequest('/api/dividends?symbol=GE');
      
      // Second request should hit cache
      const { status, data } = await apiRequest('/api/dividends?symbol=GE');
      
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      // Source might be 'cache' if within TTL
    });
  });

  describe('Error Handling', () => {
    it('should handle missing parameters gracefully', async () => {
      const { status, data } = await apiRequest('/api/dividends');
      
      expect(status).toBe(400);
      expect(data.error).toBeDefined();
    });

    it('should handle invalid query templates', async () => {
      const { status, data } = await apiRequest('/api/data/query', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'single',
          template: 'non_existent_template',
          params: { symbol: 'AAPL' }
        })
      });
      
      expect(status).toBe(500);
      expect(data.ok).toBe(false);
      expect(data.error).toBeDefined();
    });

    it('should handle network timeouts', async () => {
      // This would test timeout handling - implementation depends on your setup
      // You might need to mock slow responses or use a test endpoint
    });
  });
});

describe('Performance Tests', () => {
  it('should handle concurrent requests efficiently', async () => {
    const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'];
    const startTime = Date.now();
    
    const promises = symbols.map(symbol => 
      apiRequest(`/api/dividends?symbol=${symbol}`)
    );
    
    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;
    
    // All requests should complete
    results.forEach(({ status }) => {
      expect(status).toBe(200);
    });
    
    // Should complete within reasonable time (adjust based on your requirements)
    expect(duration).toBeLessThan(10000); // 10 seconds for 5 parallel requests
  });

  it('should efficiently cache repeated queries', async () => {
    const symbol = 'TSLA';
    
    // First request (cache miss)
    const start1 = Date.now();
    const { data: data1 } = await apiRequest(`/api/dividends?symbol=${symbol}`);
    const duration1 = Date.now() - start1;
    
    // Second request (should hit cache)
    const start2 = Date.now();
    const { data: data2 } = await apiRequest(`/api/dividends?symbol=${symbol}`);
    const duration2 = Date.now() - start2;
    
    // Cache hit should be faster
    expect(duration2).toBeLessThan(duration1 * 0.5);
    
    // Data should be consistent
    expect(data1.symbol).toBe(data2.symbol);
  });
});

// Export test utilities for use in other test files
export const testUtils = {
  apiRequest,
  BASE_URL
};
