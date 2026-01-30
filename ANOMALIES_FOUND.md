# MegaETH Stress Test: Anomalies Found

**Analysis Date:** January 29, 2026
**Sample Size:** 500,000 transactions from stress test blocks

---

## 🚨 CRITICAL ANOMALIES

### 1. 37.4% Traffic to ONE Contract (SPAM)

| Metric | Value |
|--------|-------|
| Contract | `0xaab1c664cead881afbb58555e6a3a79523d3e4c0` |
| Transactions | 187,024 (37.4% of all traffic) |
| Calldata Size | 516 bytes (100% identical) |
| Gas Used | ~190,000 (100% identical) |
| kv_updates | 5 (100% identical) |
| Unique Senders | 48,767 |

**Verdict:** This is automated spam. Every transaction has identical calldata, gas, and state updates. Nearly 50K wallets each sending ~4 identical transactions.

---

### 2. state_growth Exceeds Limit by 609%

| Documented Limit | Actual Max | Percentage |
|------------------|------------|------------|
| 1,000/block | 6,090/block | **609%** |

Either MegaETH's documentation is wrong, or limits aren't enforced.

---

### 3. Near-Zero Failure Rate (Impossible for Real Traffic)

| Metric | Value |
|--------|-------|
| Failed Transactions | **1** out of 500,000 |
| Failure Rate | **0.0002%** |
| Normal Failure Rate | 1-5% |

Real blockchain traffic has failures from: user errors, slippage, gas estimation, contract reverts. A 0.0002% rate proves this is carefully orchestrated synthetic traffic.

---

### 4. Zero TPS Variance (Synthetic Generation)

| Metric | Value |
|--------|-------|
| Min TPS | 16,024 |
| Max TPS | 16,105 |
| Variance | **0.5%** |

Real traffic has peaks and valleys. This flat line proves constant-rate synthetic generation.

---

## 📊 Transaction Pattern Breakdown

| Pattern | Count | % of Total | Description |
|---------|-------|------------|-------------|
| Spam Contract A (516B) | 187,024 | 37.4% | Identical spam |
| System Contracts | 344 | 0.1% | `0x6342...`, `0x4200...` |
| DEX/DeFi | **0** | 0% | No varied calldata detected |
| Dust Transfers (0 calldata) | ~300 | 0.1% | Simple ETH transfers |
| Other | 312,332 | 62.5% | Unknown patterns |

---

## 🔥 Volatile Windows Found

From earlier analysis:

| Window | Gas Spike | Drop | Volatility Score |
|--------|-----------|------|------------------|
| 17:27:45-17:27:49 | +33.4% | -24.9% | 36.09 |
| Block 6305856 | +60.3% above mean | - | Highest spike |

---

## 📈 E2E Latency Discrepancy

| Metric | Claimed | Measured | Multiplier |
|--------|---------|----------|------------|
| Block Time | 10ms | ~1,000ms | 100x worse |
| E2E Latency | 55ms | 1,533ms | **28x worse** |
| P95 Latency | ~55ms | 4,000ms | **73x worse** |

---

## Summary: What This Proves

1. **37%+ of stress test is spam** from one contract
2. **0% organic DeFi activity** detected
3. **Near-zero failures** = synthetic, not real users
4. **Flat TPS** = constant-rate generation, not organic demand
5. **Latency claims don't match** measured reality
6. **Resource limits** either wrong or not enforced

---

## Key Addresses to Investigate

| Address | Role | Transactions |
|---------|------|--------------|
| `0xaab1c664cead881afbb58555e6a3a79523d3e4c0` | SPAM RECEIVER | 187,024 |
| `0xa30a04b433999d1b20e528429ca31749c7a59098` | Secondary spam | 316 |
| `0x6342000000000000000000000000000000000001` | System contract | 312 |
| `0x897a33a0af45b3ba097bd6045187d622252e6acd` | High-gas contract | 312 |

---

## Data Files

- `timeseries_early.csv` - Pre-stress test blocks
- `timeseries_stress.csv` - Stress test blocks
- `volatile_windows.csv` - Ranked by volatility
- Release assets: Full CSV data (7.6GB)

## Live Status

http://137.184.57.29/status.html
