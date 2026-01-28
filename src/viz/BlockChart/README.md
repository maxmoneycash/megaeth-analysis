# MegaETH Block Production Chart

ASCII-style line chart visualization showing real-time MegaETH block production rates for both **Mini Blocks** (~10ms) and **EVM Blocks** (~1s).

![Bloomberg Terminal Style](../../../video/Bloomberg.png)

## Features

- ✅ **Real-time miniblock subscription** via `eth_subscribe('miniBlocks')`
- ✅ **Dual line chart**: Mini blocks (cyan) + EVM blocks (green)
- ✅ **Bloomberg terminal ASCII aesthetic**: Dotted lines, monospace font
- ✅ **7 time windows**: 1min, 5min, 15min, 1h, 6h, 24h, 7d
- ✅ **Live WebSocket connection** with auto-reconnect
- ✅ **Block counting** with automatic aggregation

## How to View

### Standalone HTML (Recommended)

Open directly in your browser via Vite dev server:

```bash
npm run dev
```

Then navigate to:
```
http://localhost:5175/src/viz/BlockChart/megaeth-block-production.html
```

### Integrated Mode

Use the `BlockCountStream` in your app:

```typescript
import { BlockCountStream } from './streams/BlockCountStream';

const blockStream = new BlockCountStream('wss://carrot.megaeth.com/wss');

blockStream.subscribe((data) => {
  console.log('EVM blocks in last minute:', data.evmBlocks);
  console.log('Mini blocks in last minute:', data.miniBlocks);
});

blockStream.start();

// Get counts for different windows
const windows = blockStream.getAllWindows();
console.log('15min window:', windows['15m']);
```

## Data Schema

### Mini Block WebSocket Message

```json
{
  "jsonrpc": "2.0",
  "method": "eth_subscription",
  "params": {
    "subscription": "0x...",
    "result": {
      "payload_id": "0x...",
      "block_number": 12345,
      "index": 42,
      "tx_offset": 0,
      "log_offset": 0,
      "gas_offset": 0,
      "timestamp": 1704067200000,
      "gas_used": 1000000,
      "transactions": [...],
      "receipts": [...]
    }
  }
}
```

### Block Count Data

```typescript
{
  evmBlocks: number,      // Count of EVM blocks in window
  miniBlocks: number,     // Count of mini blocks in window
  timestamp: number       // Current timestamp (ms)
}
```

## Architecture

### BlockCountStream

Tracks block production across multiple time windows:

- Subscribes to `miniBlocks` via WebSocket
- Tracks when `block_number` changes (EVM block)
- Maintains rolling windows for each time range
- Auto-cleans old data every 10 seconds

### ASCII Chart Visualization

- p5.js canvas rendering at 10 FPS for retro effect
- Grid lines every 1/5 of height, 1/6 of width
- ASCII characters for data points:
  - `·` (dot) for mini blocks (cyan)
  - `▪` (square) for EVM blocks (green)
- Resamples data to 60 points for smooth visualization

## Time Windows

| Window | Duration | Use Case |
|--------|----------|----------|
| 1 min  | 60s      | Real-time monitoring |
| 5 min  | 5 min    | Short-term trends |
| 15 min | 15 min   | Medium-term patterns |
| 1 hour | 1 hour   | Hourly overview |
| 6 hours| 6 hours  | Half-day trends |
| 24 hours| 1 day   | Daily patterns |
| 7 days | 1 week   | Weekly trends |

## Expected Production Rates

| Type | Target Rate | Actual (varies) |
|------|-------------|-----------------|
| Mini Blocks | ~100/sec | 50-150/sec |
| EVM Blocks | ~1/sec | 0.5-2/sec |

## WebSocket Endpoint

```
wss://carrot.megaeth.com/wss
```

Subscription method:
```json
{
  "jsonrpc": "2.0",
  "method": "eth_subscribe",
  "params": ["miniBlocks"],
  "id": 1
}
```

## Files

- `megaeth-block-production.html` - Standalone visualization
- `index.ts` - Module exports
- `../streams/BlockCountStream.ts` - WebSocket subscription & data tracking
- `README.md` - This file

## Next Steps

- [ ] Add block production rate trends (increasing/decreasing indicators)
- [ ] Show miniblock aggregation (how many mini blocks per EVM block)
- [ ] Add export to CSV/JSON
- [ ] Compare against historical baseline
