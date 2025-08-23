#!/usr/bin/env node
// Test script for IBKR integration endpoints
// Run with: node scripts/ibkr/test-integration.js

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const tests = [
  {
    name: 'Symbol Search',
    endpoint: '/api/ibkr/search?q=AAPL',
    expected: { ok: true }
  },
  {
    name: 'Company Search',
    endpoint: '/api/company/search?q=AAPL',
    expected: { ok: true }
  },
  {
    name: 'Basic Quote',
    endpoint: '/api/ibkr/basic?symbol=AAPL',
    expected: { ok: true }
  },
  {
    name: 'Company Quote',
    endpoint: '/api/company?symbol=AAPL',
    expected: { symbol: 'AAPL' }
  },
  {
    name: 'Historical Data (Chart)',
    endpoint: '/api/chart?symbol=AAPL&range=1y',
    expected: { ok: true }
  },
  {
    name: 'Options Expiries',
    endpoint: '/api/expiries?symbol=AAPL',
    expected: { ok: true }
  },
  {
    name: 'Options Chain',
    endpoint: '/api/options?symbol=AAPL',
    expected: { ok: true }
  }
];

async function runTests() {
  console.log('🧪 Testing IBKR Integration Endpoints');
  console.log('=====================================\n');
  console.log(`Base URL: ${BASE_URL}\n`);
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    process.stdout.write(`Testing ${test.name}... `);
    
    try {
      const response = await fetch(`${BASE_URL}${test.endpoint}`);
      const data = await response.json();
      
      // Check expected fields
      let success = true;
      for (const [key, value] of Object.entries(test.expected)) {
        if (data[key] !== value) {
          success = false;
          break;
        }
      }
      
      if (success && response.ok) {
        console.log('✅ PASSED');
        passed++;
        
        // Show some details for successful tests
        if (data.source) console.log(`  Source: ${data.source}`);
        if (data.data?.length) console.log(`  Results: ${data.data.length} items`);
        if (data.expiries?.length) console.log(`  Expiries: ${data.expiries.length} dates`);
      } else {
        console.log('❌ FAILED');
        console.log(`  Status: ${response.status}`);
        console.log(`  Error: ${data.error || 'Unexpected response'}`);
        failed++;
      }
    } catch (error) {
      console.log('❌ FAILED');
      console.log(`  Error: ${error.message}`);
      failed++;
    }
    
    console.log('');
  }
  
  console.log('=====================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('');
  
  if (failed > 0) {
    console.log('⚠️  Some tests failed. This is expected if IBKR gateway is not running.');
    console.log('To start IBKR gateway, run: scripts/ibkr/bootstrap_gateway.sh');
  } else {
    console.log('✅ All tests passed!');
  }
}

// Run tests
runTests().catch(console.error);
