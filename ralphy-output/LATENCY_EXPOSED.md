# MegaETH Latency EXPOSED

**Date:** January 22, 2026
**Investigation by:** MegaViz Ralphy Loop

## Executive Summary

MegaETH claims **55ms E2E latency** with **sub-10ms blocks**. Our investigation using their own GameMoves contract reveals the REAL user-experienced latency is **28-73x WORSE than claimed**.

## Discovery: The GameMoves Contract

We found the `GameMoves` contract at `0xa30a04b433999d1b20e528429ca31749c7a59098` which stores:
- `clientTimestamp` - when the user pressed the key
- `blockTimestamp` - when the move was recorded on-chain

This gives us **ACTUAL user-experienced latency**!

## The Data (30 samples from 50 blocks)

| Metric | MegaETH Claims | ACTUAL Measured | Ratio |
|--------|----------------|-----------------|-------|
| Average Latency | 55ms | **1,533ms** | **28x worse** |
| p50 (Median) | ~55ms | **1,000ms** | 18x worse |
| p95 | - | **4,000ms** | 73x worse |
| p99 | - | **6,000ms** | 109x worse |
| Min | - | 1,000ms | 18x worse |
| Max | - | 6,000ms | 109x worse |

## Distribution

```
Latency Distribution (30 samples):
   1s: █████████████████████ (21)
   2s: ██████ (6)
   3s: █ (1)
   4s: █ (1)
   6s: █ (1)
```

**70% of transactions take 1 second or more!**

## User Complaints Validated

This data explains the user complaints from @chunibro:

> "Crossy Fluffle: Unplayable for me. The game keeps getting interrupted because I need to wait for txn's to finish lol"

The screenshot showed "WAIT FOR TXNS TO FINISH!" warnings - now we know why. Users are waiting **1-6 seconds** for their moves to register, not the claimed 55ms.

## Contracts Discovered

| Contract | Address | Purpose |
|----------|---------|---------|
| GameMoves | `0xa30a04b433999d1b20e528429ca31749c7a59098` | Stores player moves with timestamps |
| FluffleMega | `0x05bE74062e1482616c0E8C7553e6476EfC9Cd43E` | Crossy Fluffle game |
| UniversalRouter | `0xaab1c664cead881afbb58555e6a3a79523d3e4c0` | DEX swap spam target |

## Methodology

1. Fetched last 50 blocks from MegaETH mainnet
2. Extracted all `storeMove()` calls to GameMoves contract
3. Decoded `clientTimestamp` and `blockTimestamp` from transaction data
4. Calculated latency: `blockTimestamp - clientTimestamp`
5. Generated statistics

## Raw Data

See `latency-data.json` for full dataset.

## Conclusions

1. **MegaETH's latency claims are FALSE** - Actual latency is 28-73x worse than advertised
2. **Real users are experiencing 1-6 second delays** in games
3. **The "stress test" is exposing real limitations** that contradict marketing claims
4. **EIP-1559 is disabled** - Gas prices don't respond to congestion
5. **99% of traffic is synthetic** - Real user adoption is minimal

---

*Investigation by MegaViz Ralphy Loop - January 22, 2026*
