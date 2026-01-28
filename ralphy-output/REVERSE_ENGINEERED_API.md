# MegaETH Stats API - Reverse Engineered

**Date:** January 22, 2026
**Source:** stress.megaeth.com

## Discovery

By analyzing the JavaScript bundles from stress.megaeth.com, we discovered the secret WebSocket endpoint used to power their live stats dashboard.

## API Endpoints

### WebSocket (Live Stats)
```
wss://mainnet-dashboard.megaeth.com/metrics
```

#### Connection
```javascript
const ws = new WebSocket('wss://mainnet-dashboard.megaeth.com/metrics');

// Send keepalive pings every 30 seconds
setInterval(() => {
  ws.send(JSON.stringify({ type: 'ping' }));
}, 30000);
```

#### Initial Payload (on connect)
The first message contains full historical data:

```json
{
  "data": {
    "historical_tps_24h": [
      { "timestamp": 1769104861, "value": 16034.1 },
      // ... 1440 data points (1 per minute for 24h)
    ],
    "historical_tps_3h": [...],
    "historical_tps_7d": [...],
    "historical_mini_block_interval_3h": [...],
    "historical_mini_block_interval_24h": [...],
    "historical_mini_block_interval_7d": [...],
    "historical_gas_per_second_3h": [...],
    "historical_gas_per_second_24h": [...],
    "historical_gas_per_second_7d": [...]
  }
}
```

#### Delta Updates
After the initial payload, you receive delta updates:

```json
{
  "type": "history_delta",
  "data": {
    "historical_tps_3h": { "timestamp": 1769104861, "value": 16034.1 },
    "historical_mini_block_interval_3h": { "timestamp": 1769104861, "value": 9.756098 },
    "historical_gas_per_second_3h": { "timestamp": 1769104861, "value": 1749224400 }
  }
}
```

### HTTP Endpoints (tRPC)

**Endpoint Health:**
```
GET https://stress.megaeth.com/api/trpc/chain.getEndpointHealth
```

Response:
```json
{
  "result": {
    "data": {
      "json": {
        "endpoints": [
          { "name": "MegaETH", "chainId": 4326, "httpUrl": "https://mainnet.megaeth.com/rpc", "http": { "status": "ok", "latencyMs": 59 } },
          { "name": "Base", "chainId": 8453, "httpUrl": "https://mainnet.base.org", "http": { "status": "ok", "latencyMs": 35 } },
          { "name": "Monad", "chainId": 143, "httpUrl": "https://rpc.monad.xyz", "http": { "status": "ok", "latencyMs": 31 } },
          { "name": "Solana", "chainId": 101, "httpUrl": "https://andee-mn7j2p-fast-mainnet.helius-rpc.com", "http": { "status": "ok", "latencyMs": 68 } }
        ],
        "timestamp": 1769104918426
      }
    }
  }
}
```

**Token Prices:**
```
GET https://stress.megaeth.com/api/trpc/chain.getTokenPrices
```

Response:
```json
{
  "result": {
    "data": {
      "json": {
        "eth": 2957.4,
        "mon": 0.01814064,
        "sol": 128.47,
        "timestamp": 1769104923130
      }
    }
  }
}
```

## Live Stats Captured (January 22, 2026)

| Metric | Value |
|--------|-------|
| Data Points (24h) | 1,440 |
| Latest TPS | 16,028 |
| 24h Average TPS | 1,388 |
| 24h Max TPS | 31,380 |
| 24h Min TPS | 20 |
| Last 1h Avg TPS | 13,029 |
| Last 3h Avg TPS | 8,030 |
| Avg Gas/s | 0.15 Ggas/s |
| Max Gas/s | 2.67 Ggas/s |
| Avg Block Interval | 10.0 ms |
| Min Block Interval | 8.3 ms |
| Max Block Interval | 10.4 ms |

## Key Observations

1. **24h Average vs Display**: Their dashboard shows "live" TPS which is the latest value (~16K), but the 24-hour average is only **1,388 TPS**.

2. **Nowhere near 100K TPS**: The maximum TPS recorded in 24h was **31,380**, about 31% of their claimed 100K+ capability.

3. **Traffic Volatility**: TPS ranges from 20 to 31,380, suggesting the high numbers come from burst traffic (bots/stress test).

4. **Block Interval**: The 10ms average block interval is accurate to their claims.

5. **Gas Usage**: Avg 0.15 Ggas/s suggests relatively simple transactions (transfers/swaps), not complex smart contract calls.

## Comparison with Our Independent Analysis

| Source | Metric | Value |
|--------|--------|-------|
| MegaETH Dashboard | 24h Avg TPS | 1,388 |
| Our RPC Analysis | Measured TPS | 36 |
| MegaETH Dashboard | Max TPS | 31,380 |
| MegaETH Claims | Claimed TPS | 100,000+ |
| Our Latency Analysis | Avg Latency | 1,533ms |
| MegaETH Claims | Claimed Latency | 55ms |

## Scripts

Use our tool to connect to their stats WebSocket:

```bash
node src/viz/SyntheticTrafficMonitor/scripts/megaeth-stats-websocket.mjs
node src/viz/SyntheticTrafficMonitor/scripts/megaeth-stats-websocket.mjs --continuous
```

---

*Reverse engineering by MegaViz Ralphy Loop - January 22, 2026*
