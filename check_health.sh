#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

URL="https://e859a958ddc3.ngrok-free.app/health"

echo "Checking health endpoint: $URL"
echo "----------------------------------------"

# Get response with headers
response=$(curl -s -w "\n__HTTP_STATUS_CODE__:%{http_code}" "$URL")
http_code=$(echo "$response" | grep "__HTTP_STATUS_CODE__" | cut -d: -f2)
body=$(echo "$response" | sed '/__HTTP_STATUS_CODE__/d')

# Check HTTP status
echo "HTTP Status: $http_code"

if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}✓ Server is responding${NC}"
    
    # Check if response is JSON
    if echo "$body" | python3 -c "import sys, json; json.loads(sys.stdin.read())" 2>/dev/null; then
        echo -e "${GREEN}✓ Valid JSON response${NC}"
        echo ""
        echo "Formatted JSON:"
        echo "$body" | python3 -m json.tool
    else
        echo -e "${YELLOW}⚠ Response is not valid JSON${NC}"
        echo ""
        echo "Raw response:"
        echo "$body"
    fi
else
    echo -e "${RED}✗ Server is not responding correctly${NC}"
    
    # Check if it's an ngrok offline error
    if echo "$body" | grep -q "ERR_NGROK_3200"; then
        echo -e "${RED}✗ Ngrok tunnel is offline${NC}"
        echo ""
        echo "To fix this issue:"
        echo "1. Start your local server (if not already running)"
        echo "2. Start ngrok with: ngrok http <your-port>"
        echo "3. Update the URL in this script with the new ngrok URL"
    else
        echo ""
        echo "Response body:"
        echo "$body" | head -20
    fi
fi
