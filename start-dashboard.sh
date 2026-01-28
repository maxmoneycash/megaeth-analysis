#!/bin/bash
# MegaViz Dashboard Startup Script
# Run this after cloning: ./start-dashboard.sh

echo "==================================="
echo "  MegaViz Dashboard Startup"
echo "==================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "[1/3] Installing dependencies..."
    npm install
else
    echo "[1/3] Dependencies already installed"
fi

# Kill any existing processes on our ports
echo "[2/3] Starting WebSocket proxy..."
pkill -f "ws-proxy.mjs" 2>/dev/null
node src/viz/SyntheticTrafficMonitor/scripts/ws-proxy.mjs &
WS_PID=$!
sleep 1

# Check if proxy started
if ps -p $WS_PID > /dev/null 2>&1; then
    echo "      WebSocket proxy running (PID: $WS_PID)"
else
    echo "      ERROR: WebSocket proxy failed to start!"
    exit 1
fi

echo "[3/3] Starting Vite dev server..."
echo ""
echo "==================================="
echo "  Dashboard will open at:"
echo "  http://localhost:5173/src/viz/SyntheticTrafficMonitor/synthetic-traffic-monitor.html"
echo "==================================="
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Start Vite (this blocks)
npm run dev

# Cleanup on exit
kill $WS_PID 2>/dev/null
