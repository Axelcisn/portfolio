#!/usr/bin/env node

// scripts/ibkr/start-connection.js
// Script to start and manage IBKR connection

import { exec } from 'child_process';
import { promisify } from 'util';
import https from 'https';
import { getConnectionManager } from '../../lib/services/ibkrConnectionManager.js';

const execAsync = promisify(exec);

// Check if a port is listening
async function checkPort(port) {
  try {
    const { stdout } = await execAsync(`lsof -i :${port} | grep LISTEN`);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

// Check IBKR API endpoint
async function checkEndpoint(url) {
  return new Promise((resolve) => {
    try {
      const reqUrl = new URL(url);
      const options = {
        hostname: reqUrl.hostname,
        port: reqUrl.port,
        path: reqUrl.pathname,
        method: 'GET',
        timeout: 5000,
        rejectUnauthorized: false
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({
              connected: res.statusCode === 200,
              authenticated: json.authenticated || false,
              data: json
            });
          } catch {
            resolve({ connected: false, error: 'Invalid response' });
          }
        });
      });
      
      req.on('error', () => resolve({ connected: false }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ connected: false, error: 'Timeout' });
      });
      
      req.end();
    } catch (error) {
      resolve({ connected: false, error: error.message });
    }
  });
}

async function main() {
  console.log('🔍 Checking IBKR connections...\n');
  
  // Check which services are running
  const services = [
    { name: 'IBKR Gateway GUI', port: 4000 },
    { name: 'IBKR Gateway API', port: 4001 },
    { name: 'TWS', port: 7496 },
    { name: 'TWS Paper', port: 7497 },
    { name: 'Proxy Bridge', port: 5055 }
  ];
  
  console.log('Port Status:');
  for (const service of services) {
    const isRunning = await checkPort(service.port);
    console.log(`  ${service.name} (${service.port}): ${isRunning ? '✅ Running' : '❌ Not running'}`);
  }
  
  console.log('\n🔌 Testing API Endpoints:');
  
  // Test different endpoint configurations
  const endpoints = [
    { name: 'Gateway API (4001)', url: 'https://localhost:4001/v1/api/iserver/auth/status' },
    { name: 'Gateway Direct (4000)', url: 'https://localhost:4000/v1/api/iserver/auth/status' },
    { name: 'TWS API (7496)', url: 'https://localhost:7496/v1/api/iserver/auth/status' },
    { name: 'Proxy Bridge (5055)', url: 'http://localhost:5055/iserver/auth/status' }
  ];
  
  let workingEndpoint = null;
  
  for (const endpoint of endpoints) {
    process.stdout.write(`  Testing ${endpoint.name}... `);
    const result = await checkEndpoint(endpoint.url);
    
    if (result.connected) {
      console.log(`✅ Connected (Authenticated: ${result.authenticated ? 'Yes' : 'No'})`);
      if (result.authenticated && !workingEndpoint) {
        workingEndpoint = endpoint;
      }
    } else {
      console.log(`❌ Failed (${result.error || 'Connection refused'})`);
    }
  }
  
  console.log('\n📋 Recommendations:');
  
  if (workingEndpoint) {
    console.log(`✅ Found working endpoint: ${workingEndpoint.name}`);
    console.log(`   Update your .env.local file with:`);
    
    if (workingEndpoint.name.includes('Gateway')) {
      console.log(`   USE_IBKR_GATEWAY=true`);
      console.log(`   IBKR_GATEWAY_PORT=${workingEndpoint.url.includes('4001') ? '4001' : '4000'}`);
    } else if (workingEndpoint.name.includes('TWS')) {
      console.log(`   USE_IBKR_GATEWAY=false`);
      console.log(`   IBKR_TWS_PORT=7496`);
    } else if (workingEndpoint.name.includes('Proxy')) {
      console.log(`   IB_PROXY_URL=http://localhost:5055`);
    }
  } else {
    console.log('⚠️  No working IBKR endpoint found!');
    console.log('\nTo fix this:');
    console.log('1. Start IBKR Gateway or Trader Workstation');
    console.log('2. Log in to your account');
    console.log('3. For Gateway: Enable API connections in Configure -> Settings -> API -> Settings');
    console.log('4. For TWS: Enable API connections in Edit -> Global Configuration -> API -> Settings');
    console.log('5. Make sure "Enable ActiveX and Socket Clients" is checked');
    console.log('6. Set "Socket port" to 4001 (Gateway) or 7496 (TWS)');
    console.log('7. Add "127.0.0.1" to "Trusted IPs" if not already there');
    console.log('8. Uncheck "Read-Only API" if you need trading capabilities');
  }
  
  // Test with connection manager
  console.log('\n🔄 Testing Connection Manager...');
  const manager = getConnectionManager();
  
  try {
    const status = await manager.start();
    console.log('Connection Manager Status:', {
      connected: status.connected,
      authenticated: status.authenticated,
      serverName: status.serverName || 'N/A'
    });
    
    if (!status.connected || !status.authenticated) {
      console.log('\n⚠️  Connection manager could not establish authenticated connection');
      console.log('Please check the recommendations above');
    } else {
      console.log('\n✅ Connection manager successfully connected!');
    }
    
    manager.stop();
  } catch (error) {
    console.error('Connection manager error:', error.message);
  }
}

main().catch(console.error);
