# IBKR Connection Setup Guide

## Overview
This guide will help you configure Interactive Brokers Gateway or Trader Workstation to work with your portfolio application.

## Current Status
- ✅ IBKR Gateway is running on port 4000
- ✅ TWS is running on port 7496
- ❌ API connections are not enabled in either application

## Quick Fix Instructions

### Option 1: Configure IBKR Gateway (Recommended)
IBKR Gateway is lighter and designed specifically for API access.

1. **Open IBKR Gateway** (already running on your system)

2. **Configure API Settings:**
   - Click on **Configure** → **Settings**
   - Navigate to **API** → **Settings**
   - Enable these options:
     - ✅ **Enable ActiveX and Socket Clients**
     - ✅ **Allow connections from localhost only** (for security)
   - Set **Socket port** to `4001`
   - Add `127.0.0.1` to **Trusted IPs** list
   - Uncheck **Read-Only API** if you need trading capabilities
   - Click **OK** to save

3. **Restart Gateway** for changes to take effect

### Option 2: Configure Trader Workstation (TWS)
If you prefer using TWS instead:

1. **Open TWS** (already running on your system)

2. **Configure API Settings:**
   - Go to **Edit** → **Global Configuration** (or **File** → **Global Configuration** on Mac)
   - Navigate to **API** → **Settings**
   - Enable these options:
     - ✅ **Enable ActiveX and Socket Clients**
     - ✅ **Allow connections from localhost only**
   - Set **Socket port** to `7496` (default) or `7497` for paper trading
   - Add `127.0.0.1` to **Trusted IPs** list
   - Set **Master API client ID** to blank or `0`
   - Uncheck **Read-Only API** if you need trading capabilities
   - Click **OK** to save

3. **Restart TWS** for changes to take effect

## Environment Configuration

Once you've enabled API access, update your `.env.local` file:

### For IBKR Gateway:
```env
USE_IBKR_GATEWAY=true
IBKR_GATEWAY_PORT=4001
```

### For TWS:
```env
USE_IBKR_GATEWAY=false
IBKR_TWS_PORT=7496
```

## Testing Your Connection

After configuration, run the diagnostic script:

```bash
node scripts/start-ibkr-connection.js
```

You should see:
- ✅ Connected status for your chosen endpoint
- ✅ Authenticated: Yes

## Troubleshooting

### Common Issues:

1. **"Connection refused" errors**
   - API is not enabled in IBKR Gateway/TWS
   - Wrong port number configured
   - Application needs restart after configuration changes

2. **"Not authenticated" errors**
   - You're not logged into your IBKR account
   - Session has expired (need to re-login)
   - Competing session from another application

3. **DNS/Network errors**
   - The system was trying to use a Cloudflare tunnel that's not available
   - Fixed by using local connections instead

4. **Both Gateway and TWS running simultaneously**
   - This is fine, but only use one for API connections
   - Gateway is recommended for API-only usage
   - TWS if you also want to trade manually

## Connection Architecture

The updated system now has multiple layers of resilience:

1. **Primary Connection**: Direct to IBKR Gateway (port 4001)
2. **Fallback 1**: Direct to TWS (port 7496)
3. **Fallback 2**: Through local proxy bridge (port 5055)
4. **Auto-reconnection**: Connection manager handles disconnections
5. **Keep-alive**: Prevents session timeouts

## Optional: Run the Proxy Bridge

For even better connection management, you can run the proxy bridge:

```bash
node lib/services/ibkrProxyBridge.js
```

This provides:
- Automatic failover between Gateway and TWS
- Connection pooling
- Request retry logic
- Health monitoring

## Next Steps

1. Enable API in either Gateway or TWS (follow instructions above)
2. Restart the application
3. Run the diagnostic script to verify connection
4. Start your Next.js application:
   ```bash
   npm run dev
   ```

## Security Notes

- Always use **localhost only** connections for security
- Keep **Read-Only API** checked unless you need trading
- Never expose IBKR API ports to the internet
- Use the proxy bridge for additional security layers

## Support

If you continue to have issues:
1. Check IBKR Gateway/TWS logs for error messages
2. Ensure you're logged into your IBKR account
3. Try switching between Gateway and TWS
4. Restart both the IBKR application and your portfolio app
