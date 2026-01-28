# MegaETH Stress Test Investigation - Complete Summary

**Date:** January 22, 2026
**Investigator:** MegaViz Ralphy Loop

---

## Executive Summary

MegaETH launched a highly publicized "stress test" on mainnet claiming:
- **100,000+ TPS capability**
- **55ms end-to-end latency**
- **Sub-10ms block times**

Our investigation using **on-chain data analysis**, **reverse-engineered APIs**, and **game contract telemetry** reveals significant discrepancies between claims and reality.

---

## Key Findings

### 1. TPS Reality vs Claims

| Source | Metric | Value | Discrepancy |
|--------|--------|-------|-------------|
| MegaETH Claims | Max TPS | 100,000+ | - |
| Their Own Dashboard | 24h Max TPS | 31,380 | **69% short** |
| Their Own Dashboard | 24h Avg TPS | 1,388 | **99% short** |
| Our RPC Measurement | Observed TPS | 36 | Baseline organic |

**Verdict:** Even their own dashboard shows max 31K TPS (not 100K+), and the average is only 1,388 TPS.

### 2. Latency Reality vs Claims (SMOKING GUN)

Using the `GameMoves` contract (`0xa30a04b433999d1b20e528429ca31749c7a59098`) which stores `clientTimestamp` vs `blockTimestamp`:

| Metric | MegaETH Claims | Actual Measured | Ratio |
|--------|----------------|-----------------|-------|
| Average Latency | 55ms | **1,533ms** | **28x worse** |
| p50 (Median) | ~55ms | **1,000ms** | 18x worse |
| p95 | - | **4,000ms** | 73x worse |
| p99 | - | **6,000ms** | 109x worse |

**Verdict:** Real users experience 1-6 SECOND latency, not 55ms. This explains the "WAIT FOR TXNS TO FINISH" errors in Crossy Fluffle.

### 3. Traffic Analysis

```
Synthetic Traffic Distribution:
├── DEX Swap Spam:     ~37% (UniversalRouter execute() calls)
├── Dust Transfers:    ~63% (Exactly 3 wei transfers)
└── Organic Traffic:   <1%  (Real user transactions)
```

**Key Contracts Identified:**
- UniversalRouter: `0xaab1c664cead881afbb58555e6a3a79523d3e4c0`
- GameMoves: `0xa30a04b433999d1b20e528429ca31749c7a59098`
- FluffleMega: `0x05bE74062e1482616c0E8C7553e6476EfC9Cd43E`

### 4. Gas Price Mechanism

```
Gas Price: FIXED at 0.001 gwei
EIP-1559: DISABLED (no fee market response)
```

Gas prices do not respond to demand - they're artificially fixed, meaning congestion isn't reflected in fees.

### 5. Block Production

| Metric | Claimed | Actual |
|--------|---------|--------|
| Block Interval | Sub-10ms | 8.3-10.4ms |

**Verdict:** Block interval claims are accurate.

---

## Reverse-Engineered Infrastructure

### WebSocket (Live Stats)
```
wss://mainnet-dashboard.megaeth.com/metrics
```

### tRPC Endpoints
```
GET https://stress.megaeth.com/api/trpc/chain.getEndpointHealth
GET https://stress.megaeth.com/api/trpc/chain.getTokenPrices
```

### RPC
```
HTTP: https://mainnet.megaeth.com/rpc
WSS:  wss://mainnet.megaeth.com/ws
Chain ID: 4326
```

---

## User Experience Evidence

From @chunibro's posts about game issues:

> "Crossy Fluffle: Unplayable for me. The game keeps getting interrupted because I need to wait for txn's to finish lol"

Screenshot showed "WAIT FOR TXNS TO FINISH!" warnings - validated by our latency measurements showing 1-6 second delays.

---

## Conclusions

1. **TPS claims are misleading**: 31K max (not 100K), 1.4K average
2. **Latency claims are FALSE**: 1.5 second average, not 55ms
3. **Traffic is 99%+ synthetic**: Bots running swap spam and dust transfers
4. **EIP-1559 is disabled**: No fee market, fixed gas prices
5. **Block times are accurate**: ~10ms as claimed
6. **Real games are unplayable**: Users report delays and transaction failures

---

## Scripts & Tools

```bash
# Latency analysis from GameMoves contract
node src/viz/SyntheticTrafficMonitor/scripts/latency-analyzer.mjs

# Real-time MegaETH stats WebSocket
node src/viz/SyntheticTrafficMonitor/scripts/megaeth-stats-websocket.mjs

# Full autonomous investigation
node src/viz/SyntheticTrafficMonitor/scripts/megaeth-ralphy-loop.mjs
```

---

## Data Files

- `ralphy-output/LATENCY_EXPOSED.md` - Latency investigation details
- `ralphy-output/REVERSE_ENGINEERED_API.md` - API documentation
- `ralphy-output/megaeth-full-stats.json` - Raw WebSocket data
- `ralphy-output/latency-data.json` - Raw latency measurements
- `ralphy-output/investigation-report.json` - Full investigation data

---

*Investigation by MegaViz Ralphy Loop - January 22, 2026*
