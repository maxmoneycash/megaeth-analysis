# MegaETH Research Summary - What We've Confirmed

**Date:** January 22, 2026

---

## Block Structure Clarification

MegaETH uses a two-tier block system:
- **Mini-blocks**: 10ms intervals (internal sequencer execution)
- **Main blocks**: ~1 second intervals (what appears in timestamps, contains bundled mini-blocks)

The 1-second timestamps we observed are CORRECT for main blocks. The 10ms claim refers to mini-block production inside the sequencer.

---

## CONFIRMED Suspicions

### 1. ✅ Latency is WAY Worse Than Claimed

**Suspicion:** 55ms E2E latency claim is false
**Confirmed:** YES

| Metric | Claimed | Measured | Source |
|--------|---------|----------|--------|
| Average Latency | 55ms | 1,533ms | GameMoves contract |
| p95 Latency | ~55ms | 4,000ms | GameMoves contract |
| p99 Latency | ~55ms | 6,000ms | GameMoves contract |

**Evidence:** The GameMoves contract stores `clientTimestamp` (when user pressed key) vs `blockTimestamp` (when recorded on-chain). This is REAL user-experienced latency.

**Corroborated by:** GitatronMaximus latency probe (median 1.9s, p95 3.4s on testnet)

---

### 2. ✅ Traffic is Mostly Synthetic (Bots)

**Suspicion:** High TPS numbers are fake/bot traffic
**Confirmed:** YES

| Traffic Type | Percentage |
|--------------|------------|
| DEX Swap Spam | ~37% |
| 3-Wei Dust Transfers | ~62% |
| Organic Traffic | <1% |

**Evidence:**
- UniversalRouter spam (execute() calls)
- Exact 3-wei value transfers (signature of automated system)
- Top 5 senders account for majority of traffic

---

### 3. ✅ TPS Claims are Misleading

**Suspicion:** 100K+ TPS is not achievable
**Confirmed:** YES (partially)

| Metric | Claimed | Actual |
|--------|---------|--------|
| Max TPS | 100,000+ | 31,380 (their own dashboard) |
| Avg TPS (24h) | - | 1,388 (their own dashboard) |
| Current TPS | 16,000+ | Includes 99% synthetic |

**Evidence:** We reverse-engineered their WebSocket (`wss://mainnet-dashboard.megaeth.com/metrics`) and extracted their own historical data showing 24h average of only 1,388 TPS.

---

### 4. ✅ EIP-1559 is Disabled

**Suspicion:** Fee market doesn't respond to demand
**Confirmed:** YES

**Evidence:**
- Gas price fixed at 0.001 gwei
- Only 1-3 unique gas prices observed across thousands of transactions
- No fee increase during "congestion"

---

### 5. ✅ Infrastructure Can't Keep Up

**Suspicion:** Their infrastructure has bottlenecks
**Confirmed:** YES

| Issue | Evidence |
|-------|----------|
| Blockscout 136 min behind | Block gap of 8,182 |
| RPC rate limiting | 429 errors during analysis |
| Empty blocks | 50+ consecutive empty blocks found |

---

### 6. ⚠️ Zero Transaction Failures (Suspicious)

**Suspicion:** Something is filtering/hiding failures
**Status:** SUSPICIOUS

**Evidence:**
- Scanned 2,691 transactions
- Found 0 failures (0.0000%)
- Real stress tests ALWAYS produce some failures

**Possible explanations:**
1. Traffic is synthetic and pre-validated (no real user errors)
2. Failures are being filtered at sequencer level
3. Network isn't actually under stress

---

## IDENTIFIED BOTTLENECKS

### Bottleneck 1: Sequencer to Block Finality
**Location:** Between mini-block production and main block inclusion
**Impact:** 1.5-6 second user-experienced latency
**Evidence:** GameMoves timestamp analysis

### Bottleneck 2: Block Explorer Indexing
**Location:** Blockscout indexer
**Impact:** 136+ minutes behind chain head
**Evidence:** Block number gap analysis

### Bottleneck 3: RPC Infrastructure
**Location:** Cloudflare/RPC layer
**Impact:** Rate limiting under normal developer load
**Evidence:** 429 errors during recon

### Bottleneck 4: Fee Market (Disabled)
**Location:** EIP-1559 mechanism
**Impact:** No congestion pricing = no economic signal for demand
**Evidence:** Fixed gas prices

---

## How to Use These Findings

### For Visualization Dashboard
1. **Latency Tracker** - Show real latency from GameMoves contract vs claimed 55ms
2. **Synthetic Traffic Gauge** - Display % of bot traffic in real-time
3. **Block Explorer Lag** - Show how far Blockscout is behind
4. **TPS Reality Check** - Compare claimed vs actual TPS

### For Stress Testing (with your 0.034 ETH)
1. **Measure your own latency** - Send transactions and time them
2. **Test during "quiet" periods** - When bots aren't running
3. **Identify sequencer behavior** - Does latency change with load?

### For Public Report
1. **GameMoves analysis** - Irrefutable on-chain evidence
2. **Their own WebSocket data** - Uses their own stats against them
3. **Blockscout lag** - Shows infrastructure failures
4. **User complaints** - @chunibro's game issues validated

---

## Data Sources Created

| File | Contents |
|------|----------|
| `LATENCY_EXPOSED.md` | GameMoves latency analysis |
| `REVERSE_ENGINEERED_API.md` | Their secret WebSocket/API |
| `RECON_FINDINGS.md` | Deep recon results |
| `latency-data.json` | Raw latency measurements |
| `megaeth-full-stats.json` | Their WebSocket data dump |

---

## Tools Created

| Script | Purpose |
|--------|---------|
| `megaeth-latency-probe.mjs` | Measure real latency |
| `megaeth-stats-websocket.mjs` | Tap their live stats |
| `latency-analyzer.mjs` | Analyze GameMoves contract |
| `megaeth-deep-recon.mjs` | Find anomalies |
| `megaeth-ralphy-loop.mjs` | Autonomous investigation |

---

## Next Steps

1. **Run stress test with your ETH** - Get first-hand latency data
2. **Update dashboard** - Add visualizations for these findings
3. **Monitor during different times** - See if patterns change
4. **Document for public** - Create shareable report

---

*Research by MegaViz - January 22, 2026*
