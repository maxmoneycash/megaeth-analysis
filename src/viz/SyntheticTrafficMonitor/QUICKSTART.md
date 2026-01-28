# MegaETH Stress Test Dashboard - Quick Start

## One-Command Startup

From the repo root:
```bash
./start-dashboard.sh
```

## Manual Startup

If the script doesn't work, run these commands in order:

### Terminal 1 - WebSocket Proxy
```bash
cd MegaViz
npm install  # First time only
node src/viz/SyntheticTrafficMonitor/scripts/ws-proxy.mjs
```

You should see:
```
[WS Proxy] Listening on ws://localhost:8765
[WS Proxy] Forwarding to wss://miniblocks.io/websocket
```

### Terminal 2 - Vite Dev Server
```bash
cd MegaViz
npm run dev
```

### Open Browser
```
http://localhost:5173/src/viz/SyntheticTrafficMonitor/synthetic-traffic-monitor.html
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| All zeros / empty data | WebSocket proxy not running - start it first |
| Page won't load | Vite not running - run `npm run dev` |
| "CONNECTING..." forever | Check Terminal 1 for proxy errors |
| Module not found errors | Run `npm install` |

## Data Sources

The dashboard gets live data from:

1. **miniblocks.io WebSocket** - Real-time miniblock stream (via local proxy on port 8765)
2. **miniblocks.io API** - Historical metrics (via Vite proxy)
3. **MegaETH RPC** - Direct blockchain queries for backfill

## Architecture

```
Browser (localhost:5173)
    │
    ├─► ws://localhost:8765 (WS Proxy) ─► wss://miniblocks.io/websocket
    │
    ├─► /miniblocks-api/* (Vite Proxy) ─► https://miniblocks.io/api/*
    │
    └─► https://mainnet.megaeth.com/rpc (Direct)
```
