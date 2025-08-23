# Deployment Checklist for Portfolio App

## Pre-Deployment Verification

### ✅ Code Changes Verified
- [x] IBKR connection issues fixed
- [x] Automatic fallback system implemented
- [x] All changes committed and pushed to GitHub

### ⚠️ Current Configuration Status
- **Mock Mode**: Currently ENABLED (`USE_MOCK_OPTIONS=true`)
- **IBKR Gateway**: Not fully configured for API access
- **Connection Status**: Using fallback/mock data

## Before Deploying to Production

### 1. IBKR Gateway Configuration (REQUIRED for live data)
To use real IBKR data in production, you need either:

#### Option A: IBKR Client Portal Gateway API
- Download from: https://www.interactivebrokers.com/en/trading/ib-api.php
- Run on port 5000 (default)
- Login with your IBKR credentials
- API will be automatically available

#### Option B: Configure existing IB Gateway
- Open IB Gateway 10.37 (currently installed)
- Configure → Settings → API → Settings
- Enable "ActiveX and Socket Clients"
- Set Socket port to 5000
- Add trusted IPs
- Restart Gateway

### 2. Environment Variables for Production
Create these environment variables in your deployment platform:

```env
# For production with real IBKR data:
USE_IBKR_GATEWAY=true
IBKR_GATEWAY_PORT=5000
USE_MOCK_OPTIONS=false  # Disable mock mode
IBKR_TIMEOUT=10000

# OR for development/demo mode:
USE_MOCK_OPTIONS=true  # Keep mock mode enabled
```

### 3. Deployment Options

#### Option 1: Deploy with Mock Data (Recommended for now)
Since IBKR Gateway API is not fully configured:
```bash
# Keep USE_MOCK_OPTIONS=true in production
# This allows the app to work without IBKR connection
vercel --prod
```

#### Option 2: Deploy with Live Data (After IBKR setup)
Once IBKR Gateway API is properly configured:
```bash
# Set USE_MOCK_OPTIONS=false in production
# Ensure IBKR Gateway is accessible from deployment server
vercel --prod
```

#### Option 3: Self-Host (Full control)
For complete control over IBKR connections:
- Deploy to a VPS/dedicated server
- Run IBKR Gateway on the same server
- Use PM2 or similar for process management
- Configure nginx as reverse proxy

## Deployment Commands

### For Vercel (if you're sure):
```bash
# Preview deployment first
vercel

# Production deployment (after verification)
vercel --prod
```

### For Other Platforms:
```bash
# Build for production
npm run build

# Start production server
npm start
```

## Post-Deployment Verification

1. **Check Health Endpoint**
   ```bash
   curl https://your-app.vercel.app/api/ibkr/health
   ```

2. **Test Search Functionality**
   ```bash
   curl "https://your-app.vercel.app/api/ibkr/search?q=AAPL"
   ```

3. **Monitor Status Page**
   - Visit: https://your-app.vercel.app/status
   - Check connection indicators

## Important Notes

### Security Considerations
- Never expose IBKR API ports to the internet directly
- Use environment variables for sensitive data
- Keep IBKR credentials secure
- Use read-only API access when possible

### Current Limitations
- IBKR Gateway on your machine is not configured for API access
- Connection will timeout without proper Gateway setup
- Mock mode is currently the safest option for deployment

## Recommendation

**Deploy with mock mode enabled for now** until you:
1. Install and configure IBKR Client Portal Gateway API
2. Test the connection locally
3. Verify all endpoints work with live data

This ensures your app remains functional while you set up the IBKR connection properly.

## Questions to Answer Before Production

1. Will production server have access to IBKR Gateway?
2. Do you want to use real-time data or mock data initially?
3. Should we set up a dedicated server for IBKR Gateway?
4. Do you need trading capabilities or just market data?

## Next Steps

1. **For immediate deployment with mock data:**
   ```bash
   vercel --prod
   ```

2. **For deployment with live IBKR data:**
   - First complete IBKR Gateway setup (see docs/IBKR_SETUP.md)
   - Test locally with `npm run dev`
   - Then deploy once confirmed working

---

**Current Status**: Ready to deploy with mock data. IBKR live connection requires additional Gateway configuration.
