#!/bin/bash

# Check bridge health locally and through ngrok
echo "===================================="
echo "TWS Bridge Health Check"
echo "===================================="
echo ""

# Check local bridge
echo "1. Checking local bridge (localhost:8788)..."
if curl -s --max-time 2 http://localhost:8788/health > /dev/null 2>&1; then
    echo "   ✅ Local bridge is running"
    curl -s http://localhost:8788/health | python3 -m json.tool | head -10
else
    echo "   ❌ Local bridge is NOT running"
    echo "   Run: cd ~/ib-tws-bridge && python3 ib_bridge_server.py &"
fi
echo ""

# Check ngrok
echo "2. Checking ngrok tunnel..."
NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | python3 -c "import sys, json; data = json.load(sys.stdin); print(data['tunnels'][0]['public_url'] if data.get('tunnels') else '')" 2>/dev/null)

if [ -z "$NGROK_URL" ]; then
    echo "   ❌ Ngrok is NOT running"
    echo "   Run: ngrok http 8788"
else
    echo "   ✅ Ngrok is running at: $NGROK_URL"
    
    # Test ngrok connection
    if curl -s --max-time 3 "$NGROK_URL/health" > /dev/null 2>&1; then
        echo "   ✅ Bridge is accessible through ngrok"
    else
        echo "   ⚠️  Ngrok is running but bridge is not accessible"
    fi
fi
echo ""

# Check Vercel deployment
echo "3. Checking Vercel deployment..."
DEPLOYMENT_URL=$(vercel ls --json 2>/dev/null | python3 -c "import sys, json; data = json.load(sys.stdin); print(data['deployments'][0]['url'] if data.get('deployments') else '')" 2>/dev/null)

if [ -n "$DEPLOYMENT_URL" ]; then
    echo "   Latest deployment: https://$DEPLOYMENT_URL"
    
    # Test API endpoint
    if curl -s --max-time 5 "https://$DEPLOYMENT_URL/api/quote?symbol=AAPL" | grep -q "symbol"; then
        echo "   ✅ API is working on latest deployment"
    else
        echo "   ❌ API is not working on latest deployment"
    fi
else
    echo "   Could not fetch deployment info"
fi
echo ""

# Show current environment variables
echo "4. Current Vercel environment variables:"
vercel env ls 2>/dev/null | grep -E "IB_BRIDGE_URL|NEXT_PUBLIC_BRIDGE_BASE" | head -6
echo ""

echo "===================================="
echo "Summary:"
echo "===================================="

# Check if everything is working
if curl -s --max-time 2 http://localhost:8788/health > /dev/null 2>&1 && [ -n "$NGROK_URL" ]; then
    echo "✅ Bridge infrastructure is operational"
    echo ""
    echo "If Vercel is still not working, ensure:"
    echo "1. IB_BRIDGE_URL is set to: $NGROK_URL"
    echo "2. NEXT_PUBLIC_BRIDGE_BASE is set to: $NGROK_URL"
    echo "3. Redeploy with: vercel --prod"
else
    echo "⚠️  Bridge infrastructure needs attention"
    echo ""
    echo "To fix:"
    [ ! "$(curl -s --max-time 2 http://localhost:8788/health 2>/dev/null)" ] && echo "1. Start bridge: cd ~/ib-tws-bridge && python3 ib_bridge_server.py &"
    [ -z "$NGROK_URL" ] && echo "2. Start ngrok: ngrok http 8788"
    echo "3. Update Vercel env vars with the ngrok URL"
    echo "4. Redeploy: vercel --prod"
fi
