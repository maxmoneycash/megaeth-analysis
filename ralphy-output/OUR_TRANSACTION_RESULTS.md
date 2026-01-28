# MegaETH Real Transaction Latency Test

**Date:** January 22-23, 2026
**Wallet:** `0xa1419Cebc7f6C678D6be39054cc69522Dec9E8C3`
**Funded:** 0.034 ETH (~$100) via official MegaETH bridge

---

## Summary

We sent **real transactions** from our own funded wallet to measure actual latency on MegaETH mainnet.

| Metric | MegaETH Claim | Our Measurement | Reality |
|--------|---------------|-----------------|---------|
| Latency | 55ms | **926ms avg** | **~17x slower** |

---

## Transaction Results

### Run 1 (after rate limit reset)
| TX | Hash | Submit Time | Confirm Time | Block |
|----|------|-------------|--------------|-------|
| 1 | `0xebfe45aecd71e74e...` | 925ms | **1070ms** | 6334739 |
| 2 | `0x2b4420084232b837...` | 1014ms | **1177ms** | 6334744 |

### Run 2 (after 60s cooldown)
| TX | Hash | Submit Time | Confirm Time | Block |
|----|------|-------------|--------------|-------|
| 1 | `0x2bf867cae55fb459...` | 617ms | **755ms** | 6335006 |
| 2 | `0x712505e8f7cbd434...` | 560ms | **701ms** | 6335009 |

---

## Analysis

### Confirmation Latency
- **Min:** 701ms
- **Max:** 1177ms
- **Avg:** 926ms
- **Claimed:** 55ms
- **Ratio:** **16.8x slower than advertised**

### Key Observations

1. **Rate Limiting:** MegaETH's RPC aggressively rate-limits after ~2-3 requests. Cloudflare returns 429 errors. This prevented us from running more transactions.

2. **Latency Variance:** Even on a "fast" chain, we saw 476ms variance (701ms to 1177ms) - not consistent.

3. **Block Gaps:** Transactions landed 3-5 blocks apart despite being sent rapidly, suggesting queuing delays.

4. **Synthetic Load Interference:** During our tests, the network was running 16K TPS of synthetic load (99.8% bot traffic). This may have contributed to higher latency.

---

## What This Means

MegaETH's marketing claims "55ms latency" but:

1. **Real user transactions take 700-1200ms** to confirm
2. **The 55ms figure may refer to internal block time**, not user-facing latency
3. **Rate limiting prevents normal usage** - you can't even send 3 transactions without getting banned

---

## Transaction Verification

All transactions can be verified on MegaETH Blockscout:
- https://megaeth.blockscout.com/tx/0xebfe45aecd71e74e...
- https://megaeth.blockscout.com/tx/0x2b4420084232b837...
- https://megaeth.blockscout.com/tx/0x2bf867cae55fb459...
- https://megaeth.blockscout.com/tx/0x712505e8f7cbd434...

---

## Remaining Balance

After 4 test transactions:
- **Starting:** 0.034 ETH ($100)
- **Remaining:** ~0.0339 ETH (~$99.90)
- **Cost:** ~0.0001 ETH (~$0.10) total for 4 transactions

---

*Investigation by MegaViz - January 23, 2026*
