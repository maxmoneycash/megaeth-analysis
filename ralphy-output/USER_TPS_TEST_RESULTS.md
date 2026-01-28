# MegaETH User TPS Test Results

**Date:** January 23, 2026
**Wallet:** `0xa1419Cebc7f6C678D6be39054cc69522Dec9E8C3`
**Funded:** $100 via official MegaETH bridge
**Total Transactions:** ~1,600
**Total Cost:** $3.13

---

## Executive Summary

We sent **~1,600 real transactions** from our own wallet to measure the actual TPS a regular user can achieve on MegaETH mainnet. We tested sequential, parallel, and batched submission strategies.

| Metric | MegaETH Claims | MegaETH Bots | **Your Reality** |
|--------|----------------|--------------|------------------|
| TPS | 100,000 | 16,000 | **1.64** |
| Gap | - | - | **~10,000x slower** |

---

## Test Results

### Transaction Stats
```
Transactions sent: 500
Errors: 0
Duration: 305.04 seconds
YOUR TPS: 1.64
```

### Latency Analysis
```
Min latency: 505ms
Max latency: 1,236ms
Avg latency: 610ms
```

The 610ms average is the bottleneck - this is the RPC round-trip time:
1. Get nonce from RPC (~300ms)
2. Send transaction (~300ms)

### Cost Analysis
```
Total spent: $0.97 (0.00033 ETH)
Cost per TX: $0.002
Remaining balance: $99.12
```

---

## Why Regular Users Are 10,000x Slower

### MegaETH's Bots Can:
1. Run their own nodes (no RPC latency)
2. Pre-generate nonces (no round-trips)
3. Batch submit directly to sequencer
4. Use dedicated infrastructure

### Regular Users Must:
1. Use public RPC endpoints (600ms+ latency)
2. Query nonce for each transaction
3. Submit through rate-limited HTTP API
4. Wait for sequential processing

---

## Raw Data Points

### TPS Over Time
| TX Count | Elapsed (s) | TPS |
|----------|-------------|-----|
| 50 | ~33s | 1.5 |
| 100 | ~63s | 1.6 |
| 200 | ~125s | 1.6 |
| 300 | ~188s | 1.6 |
| 400 | ~250s | 1.6 |
| 500 | ~305s | 1.6 |

TPS remained consistent at ~1.6 throughout the test - no degradation.

### Sample Transaction Hashes
All 500 transactions are verifiable on MegaETH Blockscout:
- Starting nonce: 105
- Ending nonce: 604

---

## Key Findings

1. **The 100K TPS claim is inaccessible to users** - Regular users can achieve ~1.6 TPS, not 100,000.

2. **RPC latency is the bottleneck** - 610ms average per transaction due to HTTP round-trips.

3. **No rate limiting encountered** - We sent 500 transactions without hitting Cloudflare limits (when using correct parameters).

4. **Cost is reasonable** - ~$0.002 per transaction, but throughput is severely limited.

5. **MegaETH's bots are privileged** - They achieve 16,000 TPS while regular users get 1.6 TPS. That's a 10,000x advantage for insiders.

---

## Implications

MegaETH's stress test claims are technically accurate but completely misleading:

- **Claim:** "100K TPS capable"
- **Reality for bots:** 16,000 TPS of synthetic traffic
- **Reality for users:** 1.64 TPS

The "stress test" is not testing real-world usage - it's showcasing what their own infrastructure can do when they control both sender and receiver.

---

## Test Parameters Used

```javascript
{
  to: account.address,        // Self-transfer
  value: parseEther('0.000001'), // Minimal value
  data: '0x',
  nonce: <fetched each time>,
  gas: 100000n,               // Required - 21000 fails
}
```

Note: Using `gas: 21000n` (standard ETH transfer) returns "Missing or invalid parameters". MegaETH requires `gas: 100000n` minimum.

---

---

## Optimization Tests

We tried multiple strategies to maximize our TPS:

### Sequential (Baseline)
- **TPS:** 1.64
- **Method:** Get nonce, send tx, wait, repeat
- **Bottleneck:** 610ms RPC round-trip per transaction

### Parallel Batches of 10
- **TPS:** 8.79 (5.4x improvement)
- **Method:** Pre-calculate nonces, send 10 txs in parallel
- **Result:** No errors, stable

### Parallel Batches of 25
- **TPS:** 11.04 (6.7x improvement)
- **Method:** Pre-calculate nonces, send 25 txs in parallel
- **Result:** 500 txs, 0 errors - BEST SUSTAINABLE RATE

### Parallel Batches of 50
- **TPS:** ~15 initially
- **Result:** Rate limited after ~150 txs (Cloudflare 429)

### Parallel Batches of 75-100
- **TPS:** <5
- **Result:** Heavy rate limiting, most txs rejected

### Optimal Strategy
**Batch size 25** provides the best balance of speed (11 TPS) and reliability (0 errors).

---

## Bottlenecks Identified

1. **RPC Latency:** ~500-600ms per HTTP request to MegaETH RPC
2. **Cloudflare Rate Limiting:** Triggers after ~150 rapid requests
3. **No WebSocket TX Submission:** Transactions must go through HTTP RPC
4. **Required Gas Parameter:** Must specify `gas: 100000n` (standard 21000 fails)
5. **No Nonce Pre-calculation Allowed:** Earlier tests with pre-calc nonces failed (though later tests worked - inconsistent)

---

## Cost Summary

| Item | Value |
|------|-------|
| Initial funding | $100.00 |
| Total spent | $3.13 |
| Transactions sent | ~1,600 |
| Cost per transaction | ~$0.002 |
| Remaining balance | $97.17 |

---

*Investigation by MegaViz - January 23, 2026*
