# Ring Radar - Real-Time MegaETH Block Visualization

**Live visualization of MegaETH block resource utilization with three synchronized charts.**

![Ring Radar Visualization](./preview.png)

## Overview

Ring Radar is a real-time block visualization that displays **6 critical MegaETH metrics** as they happen. It uses **absolute capacity limits** from the MegaETH REX specification to show exactly how much of the blockchain's capacity each block is using.

## What It Shows

### Three Synchronized Charts:

1. **Ring Radar (Left)** - Organic blob that pulses and morphs based on 6 metrics
2. **Equalizer Bars (Top-Right)** - Segmented LED-style bars showing capacity utilization
3. **Gauge Charts (Bottom-Right)** - Speedometer-style gauges for compute and storage gas

### Six Metrics Tracked:

| Metric | Description | Block Limit |
|--------|-------------|-------------|
| **Gas** | Total gas consumed | 2,000,000,000 (2B) |
| **TX Size** | Transaction data size | 12.5 MB |
| **DA** | Data availability size | 12.5 MB |
| **KV** | Key-value updates | 500,000 ops |
| **State** | New storage slots | 1,000 slots |
| **Data** | Transaction data | 12.5 MB |

## Color Scale

All charts use the same capacity-based color scale:

- 🟢 **Green** (0-33%): Low utilization
- 🟡 **Yellow** (33-66%): Medium utilization
- 🔴 **Red** (66-100%): High utilization / approaching capacity

## How It Works

### Data Source

Connects to the MegaViz API via WebSocket at `ws://localhost:3001/ws/blocks` to receive live block data with **100% accurate metrics** from mega-evm replay.

### Accurate Metrics

Unlike traditional EVM analytics that estimate, Ring Radar displays **actual execution metrics**:
- **Compute Gas**: Real computational work (from EVM execution)
- **Storage Gas**: Real storage writes (from SSTORE operations)
- **KV Updates**: Actual state database operations
- **State Growth**: Net new storage slots created
- **Data Size**: Exact bytes generated during execution

These metrics come from replaying each block through mega-evm with a hybrid RocksDB cache. See `/api/REPLAY_METRICS.md` for technical details.

### Capacity Limits

All visualizations use **absolute block-level capacity limits** from the [MegaETH REX specification](../../MegaEth%20Context%20/mega%20evm/docs/BLOCK_AND_TX_LIMITS.md):

```javascript
const CAPACITY_LIMITS = {
  gas: 2000000000,      // 2B gas
  computeGas: 200000000,  // 200M gas
  storageGas: 200000000,  // 200M gas (dual gas model)
  txSize: 13107200,     // 12.5 MB
  daSize: 13107200,     // 12.5 MB
  dataSize: 13107200,   // 12.5 MB
  kvUpdates: 500000,    // 500K operations
  stateGrowth: 1000     // 1K new slots
};
```

## Visual Elements

### 1. Ring Radar (Left)

- **Shape**: 12-point organic blob with smooth Catmull-Rom curves
- **Trails**: 10 historical states create a glowing halo effect
- **Motion**: Continuous organic wobble animation
- **Endpoints**: 12 labeled points (High/Low for each of 6 metrics)
- **Scale**: Blob extends from center (0%) to outer ring (100% capacity)

### 2. Equalizer Bars (Top-Right)

- **Bars**: 6 vertical segmented bars (50 segments each)
- **Segments**: LED-style with green→yellow→red gradient
- **Active Segments**: Light up based on capacity utilization
- **MGAS/s Line**: Flowing cyan line showing gas throughput
  - Position: Overlaid at the middle baseline
  - Motion: Smooth Bezier curves with 120 interpolated points
  - Represents: Real-time gas processing rate in megagas/second

### 3. Gauge Charts (Bottom-Right)

- **Type**: Semi-circular speedometer gauges
- **Arc**: 270° (12 segments with gaps)
- **Display**: Actual MGAS values with "MGAS" units
- **Segments**: Same green→yellow→red gradient
- **Labels**: "Compute Gas" and "Storage Gas"
- **Orientation**: Facing upward (open at bottom)

## Technical Stack

- **Rendering**: PixiJS 8 (WebGL 2D renderer)
- **Graphics**: All charts rendered with PixiJS Graphics API
- **Animation**: 60 FPS with smooth interpolation (LERP factor: 0.035)
- **Data**: WebSocket streaming from Rust API
- **Styling**: Dark theme (background: `#0a0a0f`)

## Running Locally

### Prerequisites

1. **API Server** running on port 3001:
   ```bash
   cd api
   cargo run --release --bin megaviz-api
   ```

2. **HTTP Server** to serve the HTML file

### Option 1: Simple HTTP Server

```bash
cd src/viz/RingRadar
python3 -m http.server 8000
```

Then open: `http://localhost:8000/ring-radar.html`

### Option 2: VS Code Live Server

1. Install "Live Server" extension
2. Right-click `ring-radar.html`
3. Select "Open with Live Server"

## File Structure

```
RingRadar/
├── README.md                    # This file
├── ring-radar.html              # Main visualization (PixiJS)
├── ring-radar-backup.html       # Previous version backup
├── METRICS.md                   # Old metrics calculation docs
├── RingRadar.ts                 # Old TypeScript implementation
├── MetricsNormalizer.ts         # Old normalization logic
├── WebSocketConnector.ts        # Old WebSocket client
├── types.ts                     # TypeScript type definitions
└── index.ts                     # TypeScript entry point
```

**Note**: The TypeScript files (`.ts`) are from an older implementation. The current production visualization is **`ring-radar.html`** which is a standalone PixiJS application.

## Performance

- **Frame Rate**: Locked at 60 FPS
- **Memory**: Bounded (100 gas history samples, 10 trail snapshots)
- **Rendering**: GPU-accelerated via WebGL (PixiJS)
- **Latency**: <50ms from block arrival to visual update

## Dual Gas Model

MegaETH uses a dual gas model where:

```
total_gas = compute_gas + storage_gas
```

- **Compute Gas**: Cost of EVM instruction execution
- **Storage Gas**: Cost of state writes (SSTORE operations)

The gauge charts show both components separately, while the ring radar and equalizer show total gas.

## Color Meaning

The visualization intentionally shows **low utilization** most of the time because:

1. **It's honest** - MegaETH has massive capacity headroom
2. **State Growth** often shows visible activity (10-30% typical)
3. **When busy, you'll see it** - Bursts are immediately obvious
4. **Shows true network health** - Not artificially inflated

Current typical utilization:
- Total Gas: ~1-2% of capacity
- Compute Gas: ~5-10% of capacity
- KV Updates: ~0.2% of capacity
- State Growth: ~10-30% of capacity

## Development

Built with 100% accurate metrics from the MegaViz API backend. The API replays each block through mega-evm to extract precise execution metrics.

See also:
- [API Replay Metrics Documentation](/api/REPLAY_METRICS.md)
- [MegaETH Block Limits Spec](../../MegaEth%20Context%20/mega%20evm/docs/BLOCK_AND_TX_LIMITS.md)
- [Dual Gas Model](../../MegaEth%20Context%20/mega%20evm/docs/DUAL_GAS_MODEL.md)

## License

Part of MegaViz - MegaETH Blockchain Visualization Tool
