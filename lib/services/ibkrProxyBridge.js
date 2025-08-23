// lib/services/ibkrProxyBridge.js
// IBKR Proxy Bridge - Manages connections to IBKR Gateway/TWS
// Provides a stable interface with automatic failover and connection management

import http from 'http';
import https from 'https';
import { URL } from 'url';

class IBKRProxyBridge {
  constructor(config = {}) {
    this.config = {
      port: config.port || 5055,
      endpoints: config.endpoints || [
        { name: 'Gateway', url: 'https://localhost:4001/v1/api', priority: 1 },
        { name: 'TWS', url: 'https://localhost:7496/v1/api', priority: 2 }
      ],
      healthCheckInterval: config.healthCheckInterval || 30000, // 30 seconds
      connectionTimeout: config.connectionTimeout || 10000, // 10 seconds
      retryDelay: config.retryDelay || 5000, // 5 seconds
      maxRetries: config.maxRetries || 3
    };
    
    this.currentEndpoint = null;
    this.server = null;
    this.healthCheckTimer = null;
    this.connectionStatus = new Map();
  }

  // Start the proxy server
  async start() {
    // Sort endpoints by priority
    this.config.endpoints.sort((a, b) => a.priority - b.priority);
    
    // Initial connection check
    await this.findHealthyEndpoint();
    
    // Create HTTP server
    this.server = http.createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });
    
    this.server.listen(this.config.port, () => {
      console.log(`IBKR Proxy Bridge listening on port ${this.config.port}`);
      this.startHealthCheck();
    });
    
    return this.server;
  }

  // Stop the proxy server
  stop() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  // Find a healthy endpoint
  async findHealthyEndpoint() {
    for (const endpoint of this.config.endpoints) {
      const isHealthy = await this.checkEndpointHealth(endpoint);
      if (isHealthy) {
        this.currentEndpoint = endpoint;
        console.log(`Using ${endpoint.name} at ${endpoint.url}`);
        return true;
      }
    }
    
    console.error('No healthy IBKR endpoints found');
    this.currentEndpoint = this.config.endpoints[0]; // Use first as fallback
    return false;
  }

  // Check if an endpoint is healthy
  async checkEndpointHealth(endpoint) {
    try {
      const url = new URL(endpoint.url + '/iserver/auth/status');
      const isHttps = url.protocol === 'https:';
      
      return new Promise((resolve) => {
        const options = {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname,
          method: 'GET',
          timeout: this.config.connectionTimeout,
          headers: {
            'Accept': 'application/json'
          }
        };
        
        if (isHttps) {
          options.agent = new https.Agent({ rejectUnauthorized: false });
        }
        
        const req = (isHttps ? https : http).request(options, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              const healthy = res.statusCode === 200 && json.authenticated === true;
              this.connectionStatus.set(endpoint.name, {
                healthy,
                authenticated: json.authenticated || false,
                competing: json.competing || false,
                timestamp: Date.now()
              });
              resolve(healthy);
            } catch {
              this.connectionStatus.set(endpoint.name, {
                healthy: false,
                error: 'Invalid response',
                timestamp: Date.now()
              });
              resolve(false);
            }
          });
        });
        
        req.on('error', (err) => {
          this.connectionStatus.set(endpoint.name, {
            healthy: false,
            error: err.message,
            timestamp: Date.now()
          });
          resolve(false);
        });
        
        req.on('timeout', () => {
          req.destroy();
          this.connectionStatus.set(endpoint.name, {
            healthy: false,
            error: 'Timeout',
            timestamp: Date.now()
          });
          resolve(false);
        });
        
        req.end();
      });
    } catch (error) {
      this.connectionStatus.set(endpoint.name, {
        healthy: false,
        error: error.message,
        timestamp: Date.now()
      });
      return false;
    }
  }

  // Start periodic health checks
  startHealthCheck() {
    this.healthCheckTimer = setInterval(async () => {
      const currentHealthy = await this.checkEndpointHealth(this.currentEndpoint);
      
      if (!currentHealthy) {
        console.log(`Current endpoint ${this.currentEndpoint.name} is unhealthy, finding alternative...`);
        await this.findHealthyEndpoint();
      }
    }, this.config.healthCheckInterval);
  }

  // Handle incoming requests
  async handleRequest(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    // Special endpoint for proxy status
    if (req.url === '/proxy/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        currentEndpoint: this.currentEndpoint?.name,
        endpoints: Array.from(this.connectionStatus.entries()).map(([name, status]) => ({
          name,
          ...status
        }))
      }));
      return;
    }
    
    // Forward request to current endpoint
    await this.forwardRequest(req, res);
  }

  // Forward request to IBKR endpoint
  async forwardRequest(req, res, retryCount = 0) {
    if (!this.currentEndpoint) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No IBKR endpoint available' }));
      return;
    }
    
    try {
      const targetUrl = new URL(this.currentEndpoint.url + req.url);
      const isHttps = targetUrl.protocol === 'https:';
      
      // Collect request body
      let body = '';
      req.on('data', chunk => { body += chunk; });
      
      req.on('end', () => {
        const options = {
          hostname: targetUrl.hostname,
          port: targetUrl.port || (isHttps ? 443 : 80),
          path: targetUrl.pathname + targetUrl.search,
          method: req.method,
          headers: {
            ...req.headers,
            host: targetUrl.hostname // Override host header
          },
          timeout: this.config.connectionTimeout
        };
        
        if (isHttps) {
          options.agent = new https.Agent({ rejectUnauthorized: false });
        }
        
        const proxyReq = (isHttps ? https : http).request(options, (proxyRes) => {
          // Forward response headers
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          
          // Pipe response body
          proxyRes.pipe(res);
        });
        
        proxyReq.on('error', async (err) => {
          console.error(`Proxy error with ${this.currentEndpoint.name}: ${err.message}`);
          
          // Try to find another endpoint and retry
          if (retryCount < this.config.maxRetries) {
            const previousEndpoint = this.currentEndpoint;
            await this.findHealthyEndpoint();
            
            if (this.currentEndpoint !== previousEndpoint) {
              console.log(`Retrying with ${this.currentEndpoint.name}`);
              await this.forwardRequest(req, res, retryCount + 1);
              return;
            }
          }
          
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'IBKR connection failed',
            details: err.message,
            endpoint: this.currentEndpoint.name
          }));
        });
        
        proxyReq.on('timeout', () => {
          proxyReq.destroy();
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'IBKR request timeout',
            endpoint: this.currentEndpoint.name
          }));
        });
        
        // Forward request body if present
        if (body) {
          proxyReq.write(body);
        }
        
        proxyReq.end();
      });
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Proxy error',
        details: error.message
      }));
    }
  }
}

// Export for use as a module
export default IBKRProxyBridge;

// Allow running as standalone service
if (import.meta.url === `file://${process.argv[1]}`) {
  const bridge = new IBKRProxyBridge({
    port: process.env.PROXY_PORT || 5055,
    endpoints: [
      { 
        name: 'Gateway', 
        url: process.env.GATEWAY_URL || 'https://localhost:4001/v1/api', 
        priority: 1 
      },
      { 
        name: 'TWS', 
        url: process.env.TWS_URL || 'https://localhost:7496/v1/api', 
        priority: 2 
      }
    ]
  });
  
  bridge.start().then(() => {
    console.log('IBKR Proxy Bridge started successfully');
  }).catch(err => {
    console.error('Failed to start proxy bridge:', err);
    process.exit(1);
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down proxy bridge...');
    bridge.stop();
    process.exit(0);
  });
}
