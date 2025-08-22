/**
 * Query Template System
 * 
 * A flexible template-based system for defining and executing
 * various financial data queries without code changes.
 */

/**
 * Base Query Template class
 */
export class QueryTemplate {
  constructor(config) {
    this.name = config.name;
    this.description = config.description;
    this.parameters = config.parameters || {};
    this.sources = config.sources || ['ibkr', 'yahoo'];
    this.cacheTime = config.cacheTime || 300000; // 5 minutes default
    this.transform = config.transform || ((data) => data);
    this.validate = config.validate || (() => true);
  }

  /**
   * Execute the query with given parameters
   */
  async execute(params = {}) {
    // Validate parameters
    if (!this.validate(params)) {
      throw new Error(`Invalid parameters for query ${this.name}`);
    }

    // Merge with default parameters
    const finalParams = { ...this.parameters, ...params };

    // Execute source-specific fetchers
    for (const source of this.sources) {
      try {
        const fetcher = this.getFetcher(source);
        if (!fetcher) continue;

        const rawData = await fetcher(finalParams);
        if (rawData) {
          // Apply transformation
          return this.transform(rawData, source);
        }
      } catch (error) {
        console.warn(`Query ${this.name} failed for source ${source}:`, error);
      }
    }

    throw new Error(`All sources failed for query ${this.name}`);
  }

  getFetcher(source) {
    // Override in specific templates
    return null;
  }
}

/**
 * Template Registry
 */
class TemplateRegistry {
  constructor() {
    this.templates = new Map();
    this.initializeDefaultTemplates();
  }

  /**
   * Register a new query template
   */
  register(template) {
    if (!(template instanceof QueryTemplate)) {
      throw new Error('Template must be instance of QueryTemplate');
    }
    this.templates.set(template.name, template);
  }

  /**
   * Get a template by name
   */
  get(name) {
    return this.templates.get(name);
  }

  /**
   * Execute a template by name
   */
  async execute(name, params = {}) {
    const template = this.get(name);
    if (!template) {
      throw new Error(`Template ${name} not found`);
    }
    return template.execute(params);
  }

  /**
   * List all available templates
   */
  list() {
    return Array.from(this.templates.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      sources: t.sources
    }));
  }

  /**
   * Initialize default query templates
   */
  initializeDefaultTemplates() {
    // Earnings Calendar Template
    this.register(new QueryTemplate({
      name: 'earnings_calendar',
      description: 'Fetch upcoming earnings dates and estimates',
      parameters: {
        symbol: null,
        days: 30
      },
      sources: ['yahoo', 'ibkr'],
      transform: (data, source) => {
        if (source === 'yahoo') {
          return {
            earnings: data.earningsHistory || [],
            nextEarningsDate: data.earningsDate,
            estimates: data.earningsEstimate
          };
        }
        return data;
      }
    }));

    // Insider Trading Template
    this.register(new QueryTemplate({
      name: 'insider_trading',
      description: 'Fetch recent insider trading activity',
      parameters: {
        symbol: null,
        limit: 20
      },
      sources: ['yahoo'],
      transform: (data) => ({
        transactions: data.transactions || [],
        summary: {
          totalBuys: data.transactions?.filter(t => t.type === 'buy').length || 0,
          totalSells: data.transactions?.filter(t => t.type === 'sell').length || 0
        }
      })
    }));

    // Analyst Ratings Template
    this.register(new QueryTemplate({
      name: 'analyst_ratings',
      description: 'Fetch analyst recommendations and price targets',
      parameters: {
        symbol: null
      },
      sources: ['yahoo', 'ibkr'],
      transform: (data) => ({
        recommendations: data.recommendations || [],
        priceTarget: {
          mean: data.targetMeanPrice,
          high: data.targetHighPrice,
          low: data.targetLowPrice,
          numberOfAnalysts: data.numberOfAnalystOpinions
        }
      })
    }));

    // Options Flow Template
    this.register(new QueryTemplate({
      name: 'options_flow',
      description: 'Fetch unusual options activity',
      parameters: {
        symbol: null,
        minPremium: 10000,
        limit: 50
      },
      sources: ['ibkr'],
      cacheTime: 60000, // 1 minute for flow data
      transform: (data) => ({
        flows: data.flows || [],
        summary: {
          totalVolume: data.totalVolume,
          putCallRatio: data.putCallRatio,
          unusualActivity: data.unusualActivity
        }
      })
    }));

    // Short Interest Template
    this.register(new QueryTemplate({
      name: 'short_interest',
      description: 'Fetch short interest data',
      parameters: {
        symbol: null
      },
      sources: ['yahoo'],
      transform: (data) => ({
        shortPercentOfFloat: data.shortPercentOfFloat,
        shortRatio: data.shortRatio,
        sharesShort: data.sharesShort,
        sharesShortPriorMonth: data.sharesShortPriorMonth,
        dateShortInterest: data.dateShortInterest
      })
    }));

    // Historical Volatility Template
    this.register(new QueryTemplate({
      name: 'historical_volatility',
      description: 'Calculate historical volatility over various periods',
      parameters: {
        symbol: null,
        periods: [10, 20, 30, 60, 90]
      },
      sources: ['yahoo'],
      transform: (data) => ({
        volatilities: data.volatilities || [],
        currentIV: data.impliedVolatility,
        hvRank: data.hvRank,
        hvPercentile: data.hvPercentile
      })
    }));

    // Market Correlations Template
    this.register(new QueryTemplate({
      name: 'market_correlations',
      description: 'Calculate correlations with major indices',
      parameters: {
        symbol: null,
        benchmarks: ['SPY', 'QQQ', 'IWM', 'DIA'],
        period: 90
      },
      sources: ['yahoo'],
      transform: (data) => ({
        correlations: data.correlations || {},
        beta: data.beta,
        rsquared: data.rsquared
      })
    }));

    // Fundamentals Comparison Template
    this.register(new QueryTemplate({
      name: 'peer_comparison',
      description: 'Compare fundamentals with peer companies',
      parameters: {
        symbol: null,
        peers: [],
        metrics: ['PE', 'PB', 'PS', 'MarketCap', 'Revenue', 'NetMargin']
      },
      sources: ['yahoo', 'ibkr'],
      transform: (data) => ({
        comparison: data.comparison || {},
        rankings: data.rankings || {},
        sectorAverage: data.sectorAverage || {}
      })
    }));

    // Technical Indicators Template
    this.register(new QueryTemplate({
      name: 'technical_indicators',
      description: 'Calculate various technical indicators',
      parameters: {
        symbol: null,
        indicators: ['RSI', 'MACD', 'BB', 'SMA', 'EMA'],
        period: 14
      },
      sources: ['yahoo'],
      cacheTime: 60000,
      transform: (data) => ({
        indicators: data.indicators || {},
        signals: data.signals || {},
        trend: data.trend
      })
    }));

    // News Sentiment Template
    this.register(new QueryTemplate({
      name: 'news_sentiment',
      description: 'Analyze news sentiment for a symbol',
      parameters: {
        symbol: null,
        days: 7,
        limit: 50
      },
      sources: ['yahoo'],
      transform: (data) => ({
        articles: data.articles || [],
        sentiment: {
          overall: data.overallSentiment,
          positive: data.positiveMentions,
          negative: data.negativeMentions,
          neutral: data.neutralMentions
        },
        topics: data.topics || []
      })
    }));
  }
}

// Export singleton registry
export const queryRegistry = new TemplateRegistry();

/**
 * Dynamic Query Builder
 * Allows building custom queries on the fly
 */
export class DynamicQueryBuilder {
  constructor() {
    this.query = {
      sources: [],
      parameters: {},
      transforms: [],
      aggregations: []
    };
  }

  from(...sources) {
    this.query.sources = sources;
    return this;
  }

  where(params) {
    this.query.parameters = { ...this.query.parameters, ...params };
    return this;
  }

  transform(fn) {
    this.query.transforms.push(fn);
    return this;
  }

  aggregate(fn) {
    this.query.aggregations.push(fn);
    return this;
  }

  async execute() {
    const results = [];
    
    for (const source of this.query.sources) {
      try {
        let data = await this.fetchFromSource(source, this.query.parameters);
        
        // Apply transforms
        for (const transform of this.query.transforms) {
          data = transform(data);
        }
        
        results.push({ source, data });
      } catch (error) {
        console.warn(`Dynamic query failed for source ${source}:`, error);
      }
    }

    // Apply aggregations
    let finalResult = results;
    for (const aggregate of this.query.aggregations) {
      finalResult = aggregate(finalResult);
    }

    return finalResult;
  }

  async fetchFromSource(source, params) {
    // Implement source-specific fetching logic
    // This would integrate with the existing data providers
    throw new Error(`Source ${source} not implemented in dynamic query`);
  }
}

/**
 * Query Composer
 * Combines multiple templates into complex queries
 */
export class QueryComposer {
  constructor() {
    this.queries = [];
  }

  add(templateName, params = {}) {
    this.queries.push({ templateName, params });
    return this;
  }

  async execute() {
    const results = {};
    
    await Promise.all(
      this.queries.map(async ({ templateName, params }) => {
        try {
          results[templateName] = await queryRegistry.execute(templateName, params);
        } catch (error) {
          results[templateName] = { error: error.message };
        }
      })
    );

    return results;
  }

  async executeSequential() {
    const results = {};
    
    for (const { templateName, params } of this.queries) {
      try {
        results[templateName] = await queryRegistry.execute(templateName, params);
        
        // Allow using results from previous queries
        if (params._usePrevious) {
          const prevKey = params._usePrevious;
          if (results[prevKey]) {
            params[params._usePreviousField || 'data'] = results[prevKey];
          }
        }
      } catch (error) {
        results[templateName] = { error: error.message };
      }
    }

    return results;
  }
}
