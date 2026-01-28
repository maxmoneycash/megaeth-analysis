# MegaETH Analysis Dashboard

**Stress test analysis and anomaly detection for MegaETH** — real-time monitoring, historical replay, and synthetic traffic identification.

---

## Quick Start - Dashboard URLs

Run `npm install && npm run dev` then open:

| Dashboard | URL | Description |
|-----------|-----|-------------|
| **Stress Test Dashboard** | http://localhost:5173/megaeth-stress-test.html | Main analysis dashboard with TPS, gas, latency, synthetic traffic detection |
| **Anomaly Replay** | http://localhost:5173/anomaly-replay.html | Historical data replay with gas spike timestamps |
| **Block Production** | http://localhost:5173/src/viz/BlockChart/megaeth-block-production.html | Real-time block production visualization |
| **Synthetic Traffic Monitor** | http://localhost:5173/src/viz/SyntheticTrafficMonitor/synthetic-traffic-monitor.html | Live transaction stream analysis |
| **Ring Radar** | http://localhost:5173/src/viz/RingRadar/ring-radar.html | Multi-metric capacity utilization |
| **Deployment Heatmap** | http://localhost:5173/src/viz/DeploymentHeatmap/contract-deployment-heatmap.html | Contract deployment activity |
| **Success/Fail Chart** | http://localhost:5173/src/viz/SuccessFailChart/success-fail-chart.html | Transaction success rate over time |

### One-liner startup:
```bash
./start-dashboard.sh
```

---

## Anomaly Data

All detected anomalies are in **`anomalies.csv`** with columns:
- `timestamp_iso` - ISO 8601 timestamp
- `timestamp_unix` - Unix timestamp
- `type` - GAS_SPIKE, LATENCY_MEASUREMENT, TPS_DROP, BASELINE_SAMPLE, etc.
- `severity` - critical, warning, info
- `metric_name` - gas_per_second, tx_latency, tps, block_interval
- `value` - Numeric value
- `unit` - MGas/s, ms, K TPS, etc.
- `message` - Human readable description
- `tx_hash` - Transaction hash (for latency measurements)

---

## Key Findings (Jan 22-27, 2026 Stress Test)

| Metric | Claimed | Measured | Verdict |
|--------|---------|----------|---------|
| **Latency** | 55ms | 1,533ms avg (p95: 4,000ms) | **28x WORSE** |
| **TPS** | 100,000+ | 36 TPS (organic) | **99%+ synthetic** |
| **Gas Price** | Dynamic | Fixed 0.001 gwei | **EIP-1559 DISABLED** |
| **Traffic** | Organic | ~71% dust spam, ~29% DEX spam | **~0% organic** |

---

## Original README

![MegaETH](https://img.shields.io/badge/MegaETH-Frontier-00D9A5?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square)
![Vite](https://img.shields.io/badge/Vite-7.2-646CFF?style=flat-square)
![Status](https://img.shields.io/badge/Status-Alpha-yellow?style=flat-square)

---

## The Vision

MegaViz goes beyond existing tools like [miniblocks.io](https://miniblocks.io) and Pulse. We're building a comprehensive visualizer that:

1. **Explains how MegaETH actually works** — miniblocks vs EVM blocks, sequencer → replicas
2. **Shows real-time contract activity** — who's hot, who's hogging gas
3. **Flags congestion sources** — not just aggregates, but pinpoints the culprits
4. **Looks insanely beautiful** — golden ratio spirals, animated rivers, glowing flames

Built for **MegaETH's sub-millisecond latency** — 100,000+ TPS means we need visualizations that keep up.

---

## What We've Built

### 1. Golden Ratio Spiral Heatmap ✅

Contracts arranged in a **Fibonacci spiral** showing real-time activity:
- **Center** = #1 trending contract (largest square)
- Each subsequent square is **1/φ (61.8%)** the size of the previous
- Colors: Blue (cold) → Amber (warm) → Red (hot)
- Click any contract to see transaction details

```
         ┌─────────────────────┐
         │        #4           │
┌────────┼─────────────────────┼────────┐
│   #5   │       #1            │   #2   │
│        │    (center)         │        │
└────────┼─────────────────────┼────────┘
         │        #3           │
         └─────────────────────┘
```

### 2. Transaction Flame Graphs ✅ (NEW)

Click any transaction to see its execution trace:
- **Mini flame graph** inline in the detail panel (shows call depth)
- **Full modal view** with expandable flame graph
- Shows function names (decoded from selectors), gas usage per call
- Self gas vs total gas breakdown

### 3. Gas Analytics Dashboard ✅ (NEW)

Press the 📊 button in the toolbar (or 'A' key) to open:
- **Time window tabs**: Last minute, hour, 24h, 7 days
- **Top contracts by gas consumption** with percentage bars
- **Top functions by gas** (transfer, swap, approve, etc.)
- Click any contract to drill into function-level breakdown
- **Tracks ALL transactions automatically** (not just clicked ones)

### 4. Mobile-Friendly UI ✅ (NEW)

- **Floating toolbar** at bottom of screen with touch-friendly buttons
- Touch events for mobile devices
- Click outside modals to close them

### 5. MiniBlock River 🌊 (Planned)

Animated visualization showing "one second of MegaETH":
- Particles (transactions) flow into vertical lanes (miniblocks)
- New lane appears every ~10ms (real miniblock production)
- Comparison mode: Toggle to see Ethereum's 12s blocks vs MegaETH's swarm
- Educational tooltips explaining sequencer → replica flow

### 6. Dual Block View 📊 (Planned)

MegaETH has TWO types of blocks:
- **MiniBlocks** (~10ms): Pre-confirmations, high frequency
- **EVM Blocks** (~1s): Standard blocks that aggregate miniblocks

Toggle between views to understand the architecture.

---

## Data We're Tracking

| Metric | Source | Status |
|--------|--------|--------|
| Transaction count per contract | `eth_getBlockByNumber` | ✅ Built |
| Transaction velocity (tx/sec) | Rolling window calculation | ✅ Built |
| Gas usage per contract | Transaction receipts | ✅ Built |
| **Call stacks / Flame graph** | `debug_traceTransaction` | ✅ Built |
| **Gas analytics over time** | GasAnalytics module | ✅ Built |
| **Function-level gas breakdown** | Trace parsing | ✅ Built |
| Data size (calldata/blobs) | Transaction `input` field | 🔨 Planned |
| KV updates (storage changes) | `eth_subscribe('stateChanges')` | 🔨 Planned |
| State growth | Storage slot tracking | 🔨 Planned |
| Inclusion latency (p50/p95) | Tx timestamp → miniblock time | 🔨 Planned |
| MEV detection | Bundle analysis | 🔨 Planned |

---

## Gaps We're Filling

| Existing Tool | What It Does | What We Add |
|---------------|--------------|-------------|
| **miniblocks.io** | MiniBlock flow, Contract Universe graph | Flame graphs, gas analytics, dual block view |
| **Pulse** | Tx count per block | Per-contract deep dives, latency percentiles |
| **Blockscout** | Standard explorer | Real-time animations, gas spike detection |

---

## Development Log: What We Discovered

### MegaETH Testnet Findings
1. **Limited contract diversity**: Only ~7-15 active contracts in any given 5-minute window on testnet
2. **Most transactions are simple**: Many txs have only 1-2 call frames (no complex subcalls)
3. **Dominant contract**: `0x9f0b0ae7...` (with delegate to `0xc8777ef2...`) appears frequently
4. **Oracle activity**: Lots of `decimals()` and `latestRoundData()` calls from price feeds

### RPC Limitations We Found
1. **No structLog tracer**: MegaETH only supports `callTracer` and `prestateTracer`
   - We tried to add opcode breakdown but got: `debug_traceTransaction tracer must be callTracer or prestateTracer`
   - This means we can't get opcode-level gas breakdown (SLOAD, SSTORE, etc.)
2. **WebSocket disconnects**: WSS endpoint (`wss://carrot.megaeth.com/wss`) disconnects frequently
   - We use polling as primary with WS as optional enhancement

### Challenges We Solved

**1. Flame Graph Confusion**
- Problem: Users complained "only 2 bars" and "percentages don't add up"
- Root cause: `callTracer` returns contract-to-contract calls only; simple txs have 1-2 levels
- Solution: Added `selfGas` calculation, function name resolution, explanatory headers

**2. Analytics Showed Same Data Across Time Windows**
- Problem: 1h, 24h, 7d tabs all showed identical data
- Root cause: Analytics only recorded gas when user clicked a transaction!
- Solution: Now records gas for ALL transactions in every block automatically

**3. Modal Couldn't Close on Mobile**
- Problem: User could only close modals with ESC key
- Solution: Added click-outside-to-close, floating toolbar with touch-friendly buttons

**4. PixiJS Complexity**
- Problem: PixiJS flame graph was causing bundle bloat (~300KB)
- Solution: Removed PixiJS, implemented pure Canvas 2D (~82KB bundle)

---

## Team & Tasks

### Max | $CASH (@maxmoneycash)
**Focus: Frontend, Visualization, Deployment**

| Task | Priority | Status |
|------|----------|--------|
| Set up project scaffold & repo | P0 | ✅ Done |
| Build spiral heatmap component | P0 | ✅ Done |
| Add click-to-expand detail panels | P0 | ✅ Done |
| Build flame graph visualization | P1 | ✅ Done |
| Add gas analytics dashboard | P1 | ✅ Done |
| Add mobile-friendly toolbar | P1 | ✅ Done |
| Deploy to Vercel | P1 | 🔨 Next |
| Build river animation (miniblock lanes) | P1 | 📋 Todo |
| Add comparison mode (ETH vs MegaETH) | P2 | 📋 Todo |
| Add zoom + pan navigation | P3 | 📋 Todo |

### Leena / DominoGirl (@leenamiskin-bit)
**Focus: Analytics, Metrics, Data Engineering**

| Task | Priority | Status |
|------|----------|--------|
| Calculate accurate p50/p95 inclusion latency | P1 | 📋 Todo |
| Integrate `stateChanges` subscription for KV updates | P1 | 📋 Todo |
| Calculate state growth (new storage slots / time) | P1 | 📋 Todo |
| Add gas efficiency flags (identify poorly optimized contracts) | P2 | 📋 Todo |
| Spike detection alerts (>20% network share) | P2 | 📋 Todo |
| Contract type classification (DEX, NFT, Bridge, etc.) | P2 | 📋 Todo |
| Build flame graph data processing (from `debug_traceTransaction`) | P2 | ✅ Done (Max) |
| Historical data fetch (last 24h on init) | P2 | 📋 Todo |
| Add "Ethereum Mode" preset for comparison | P3 | 📋 Todo |

### Shared Tasks

| Task | Owner | Status |
|------|-------|--------|
| Weekly syncs in Telegram | Both | 🔄 Ongoing |
| Finalize branding (name, logo, domain) | Both | 📋 Todo |
| Write documentation | Both | ✅ Done |
| Share on X/Discord for feedback | Both | 📋 Todo |

---

## How Leena Can Build Off This

### 1. Adding New Analytics Metrics

The `GasAnalytics` class (`src/analytics/GasAnalytics.ts`) is designed to be extended:

```typescript
// Current structure
interface GasEntry {
  timestamp: number;
  contractAddress: string;
  functionSelector: string;
  functionName: string;
  gasUsed: number;
  txHash: string;
}

// To add new metrics, extend the entry:
interface ExtendedGasEntry extends GasEntry {
  inclusionLatencyMs?: number;  // Time from tx submission to block
  calldataSize?: number;        // Size of input data
  storageSlotsTouched?: number; // From prestateTracer
}
```

### 2. Adding Latency Tracking

In `src/streams/MegaETHStream.ts`, you could track:
```typescript
// In transformBlock():
const blockTimestamp = parseInt(rawBlock.timestamp, 16) * 1000;
for (const tx of rawBlock.transactions) {
  // If tx has a pending timestamp, calculate latency
  const latencyMs = blockTimestamp - tx.pendingTimestamp;
}
```

### 3. Adding Contract Classification

The `ContractClassifier` in `src/viz/FlameGraph/ContractClassifier.ts` has basic patterns:
```typescript
// Extend KNOWN_CONTRACTS with more patterns:
private readonly KNOWN_CONTRACTS: Record<string, ContractInfo> = {
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': { type: 'dex', name: 'Uniswap V2 Router' },
  // Add more known contracts...
};
```

### 4. Adding Spike Detection

Create `src/analytics/SpikeDetector.ts`:
```typescript
class SpikeDetector {
  private readonly THRESHOLD = 0.20; // 20% of total gas

  checkForSpikes(stats: TimeWindowStats): ContractSpike[] {
    return stats.contracts
      .filter(c => c.percentOfTotal > this.THRESHOLD * 100)
      .map(c => ({ address: c.address, percent: c.percentOfTotal }));
  }
}
```

### 5. Key Files to Know

| File | Purpose |
|------|---------|
| `src/main.ts` | Main app entry, wires everything together |
| `src/streams/MegaETHStream.ts` | Fetches blocks from RPC |
| `src/streams/TraceStream.ts` | Fetches transaction traces via debug_traceTransaction |
| `src/analytics/GasAnalytics.ts` | Tracks gas per contract/function over time |
| `src/analytics/AnalyticsModal.ts` | Gas analytics dashboard UI |
| `src/viz/FlameGraph/ContractClassifier.ts` | Contract type detection |

---

## Architecture

```
src/
├── core/
│   ├── Renderer.ts           # Canvas 2D, 30 FPS throttling, HiDPI
│   └── visibility.ts         # Pause when off-screen
│
├── streams/
│   ├── DataStream.ts         # Hybrid polling + WebSocket
│   ├── MegaETHStream.ts      # MegaETH RPC integration
│   ├── TraceStream.ts        # debug_traceTransaction calls
│   ├── OpcodeStream.ts       # (blocked - RPC doesn't support structLog)
│   └── RingBuffer.ts         # Fixed-size circular buffer
│
├── viz/
│   ├── SpiralHeatmap/        # ✅ Main heatmap visualization
│   │   ├── SpiralHeatmap.ts
│   │   ├── ContractTracker.ts
│   │   ├── SpiralLayout.ts
│   │   ├── HeatmapColors.ts
│   │   └── DetailPanel.ts
│   ├── MiniViz/              # ✅ Inline flame graph
│   │   └── MiniFlameGraph.ts
│   ├── FullScreenViz/        # ✅ Modal with tabs
│   │   └── VizModal.ts
│   ├── FlameGraph/           # ✅ Shared types & classifier
│   │   ├── types.ts
│   │   └── ContractClassifier.ts
│   └── RiverAnimation/       # 🔨 Planned
│
├── analytics/                # ✅ Gas tracking
│   ├── GasAnalytics.ts       # Gas tracking engine
│   └── AnalyticsModal.ts     # Dashboard UI
│
├── ui/                       # ✅ Mobile UI
│   └── Toolbar.ts            # Floating toolbar
│
├── utils/
│   ├── math.ts               # lerp, clamp, smoothstep
│   └── easing.ts             # Animation curves
│
└── main.ts
```

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Rendering** | Canvas 2D | Fast, simple, ~82KB bundle |
| **Bundler** | Vite | Instant HMR |
| **Language** | TypeScript | Type safety |
| **RPC Client** | Native fetch | No viem overhead needed |
| **Deployment** | Vercel | Free, handles WebSockets |

---

## MegaETH APIs We're Using

### What Works

```typescript
// HTTP RPC
eth_getBlockByNumber('latest', true)  // Full block + txs ✅
debug_traceTransaction(hash, {tracer: 'callTracer'})  // Call stacks ✅
```

### What Doesn't Work

```typescript
// These are limited or unreliable on MegaETH testnet:
debug_traceTransaction(hash, {})  // structLog tracer ❌ Not supported
eth_subscribe('miniBlocks')       // WebSocket ⚠️ Unreliable
eth_subscribe('stateChanges')     // Not tested yet
```

### Endpoints

| Network | RPC | WebSocket |
|---------|-----|-----------|
| **Testnet (Carrot)** | `https://carrot.megaeth.com/rpc` | `wss://carrot.megaeth.com/wss` |
| **Mainnet (Frontier)** | `https://mainnet.megaeth.com/rpc` | `wss://mainnet.megaeth.com/rpc` |
| **Fallback** | `https://6342.rpc.thirdweb.com` | - |

---

## Quick Start

```bash
# Clone
git clone https://github.com/leenamiskin-bit/MegaViz.git
cd MegaViz

# Install
npm install

# Run
npm run dev
```

Open http://localhost:5173

### Usage
1. **Watch contracts appear** as transactions flow in (5-min rolling window)
2. **Click any contract square** to see its recent transactions
3. **Click a transaction** to view its flame graph
4. **Tap 📊 button** to open Gas Analytics dashboard
5. **Switch time tabs** (1m/1h/24h/7d) to see historical data

---

## Roadmap

### Phase 1: Foundation ✅ (Complete)
- [x] Project scaffold with Vite + TypeScript
- [x] Canvas renderer with frame throttling
- [x] MegaETH RPC integration
- [x] Spiral heatmap visualization
- [x] Click-to-expand contract details

### Phase 2: Deep Metrics ✅ (Complete)
- [x] Flame graph from `debug_traceTransaction`
- [x] Gas analytics dashboard with time windows
- [x] Function-level gas breakdown
- [x] Mobile-friendly UI
- [ ] State growth tracking via `stateChanges`
- [ ] P50/P95 inclusion latency
- [ ] Gas efficiency scoring
- [ ] Spike detection alerts

### Phase 3: Educational Viz (Next)
- [ ] MiniBlock river animation
- [ ] Dual block view (mini vs EVM)
- [ ] Comparison mode (MegaETH vs ETH vs Solana)
- [ ] Architecture explainer tooltips

### Phase 4: Polish & Launch
- [ ] Deploy to Vercel
- [ ] Share on MegaETH Discord/X
- [ ] Iterate based on feedback

---

## Ideas Backlog

From our brainstorming sessions:

### Visualizations
- 3D spiral using WebGL/Three.js
- Particle trails between related contracts
- Sound design (frequency mapped to activity)
- Contract "family trees" (factory → children)

### Analytics
- MEV bundle highlighting
- Contract type auto-detection
- Whale vs retail caller distribution
- Cross-chain comparison dashboards

### Features
- Watchlist for favorite contracts
- Time scrubber for historical replay
- Embed/share specific views
- Alerts for specific contracts

---

## Why MegaETH?

MegaETH is the **first real-time blockchain**:
- **~10ms miniblocks** — transactions confirm before you blink
- **100,000+ TPS** — enough data to make visualizations interesting
- **EVM compatible** — familiar tooling, standard JSON-RPC
- **Frontier just launched** — perfect timing to build tools

This is the ideal chain for real-time data viz. Traditional 12-second block times? Boring. MegaETH's 10ms updates? Now we're talking.

---

## Contributing

We're building this in public! Join us:

1. **GitHub**: [leenamiskin-bit/MegaViz](https://github.com/leenamiskin-bit/MegaViz)
2. **Branch**: `scaffold/initial-setup` (active development)
3. **PRs welcome** — especially for new visualizations

```bash
# Type check
npm run typecheck

# Build
npm run build
```

---

## License

MIT

---

<p align="center">
  <strong>Built for MegaETH Frontier</strong><br>
  <em>Visualizing the real-time blockchain revolution</em><br><br>
  Max (@maxmoneycash) · Leena (@leenamiskin-bit)
</p>
