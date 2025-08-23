# Options Data Configuration Guide

## Overview
The portfolio application supports multiple sources for options chain data:
1. **Interactive Brokers (IB) Bridge** - Real-time options data via IB API
2. **Mock Data** - Realistic generated options data for development/testing

## Problem Solved
Previously, when the IB Bridge wasn't authenticated or available, users would see:
- "Couldn't load options — No chain for selected expiry"
- Empty option chains with no useful feedback

Now the application:
- Automatically falls back to mock data when IB authentication fails
- Provides clear error messages about authentication issues
- Allows development without IB Bridge setup

## Configuration

### Environment Variables
Copy `.env.example` to `.env.local` and configure:

```bash
# IB Bridge Configuration (Production)
IB_PROXY_URL=http://localhost:5055  # IB Bridge URL
IB_BRIDGE_TOKEN=your_token_here     # Authentication token

# Development Mode
USE_MOCK_OPTIONS=true  # Set to true to always use mock data
```

### Data Source Priority
1. If `USE_MOCK_OPTIONS=true` → Always use mock data
2. If IB Bridge is authenticated → Use real IB data
3. If IB Bridge auth fails → Automatically fallback to mock data
4. If all fail → Display helpful error message

## Mock Data Features

The mock data provider generates:

- **Realistic pricing** using Black-Scholes model
- **Multiple expiries**: Weekly, monthly, and quarterly options
- **Full Greeks**: Delta, Gamma, Theta, Vega, Rho
- **Bid-Ask spreads** based on liquidity
- **Volatility smile** adjustments
- **Support for major symbols**: META, AAPL, GOOGL, AMZN, MSFT, TSLA, NVDA, SPY, QQQ

## Usage

### Development Mode
1. Set `USE_MOCK_OPTIONS=true` in `.env.local`
2. Restart the Next.js dev server
3. Options will load with realistic mock data

### Production Mode
1. Ensure IB Bridge is running on configured port
2. Set proper authentication tokens
3. Mock data will only be used as automatic fallback

### Testing Specific Symbols
Mock data automatically adjusts prices for known symbols:
- META: $752.50
- AAPL: $178.50
- GOOGL: $142.80
- Others: $100.00 (default)

## API Endpoints

### Get Options Chain
```
GET /api/ib/chain?symbol=META
GET /api/ib/chain?symbol=META&mock=true  # Force mock data
```

### Get Expiries
```
GET /api/expiries?symbol=META
```

### Get Options for Specific Date
```
GET /api/options?symbol=META&date=2025-09-19
```

## Troubleshooting

### Options Not Loading
1. Check if Next.js server is running
2. Verify environment variables in `.env.local`
3. Check browser console for errors
4. Try forcing mock data: Add `?mock=true` to URL

### Authentication Errors
- If you see "authentication required", either:
  - Configure IB Bridge tokens properly
  - Enable mock mode for development

### Restart Required
After changing `.env.local`, restart the Next.js dev server:
```bash
npm run dev
# or
yarn dev
```

## Implementation Details

### Key Features
- Automatic fallback chain: IB → Mock Server → Generated Mock
- Smart error messages that guide users
- Cached responses for performance
- Realistic option pricing with Black-Scholes model
