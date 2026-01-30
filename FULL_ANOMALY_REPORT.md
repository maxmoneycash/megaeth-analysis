# MegaETH Stress Test Anomaly Report

**Analysis Date:** 2026-01-29
**Block Range:** 6,242,989 - 6,850,000 (607K blocks)
**Samples Analyzed:** 1,585 blocks
**Total Transactions Sampled:** 7,663,731

---

## Executive Summary

The MegaETH stress test revealed several anomalies including **35 blocks with failed transactions**, **major TPS spikes/crashes**, and **gas anomalies**. The network experienced a dramatic throughput spike from 21 TPS to 32,231 TPS, followed by a gradual decline.

---

## 1. Failed Transactions

| Metric | Value |
|--------|-------|
| Total Failed TXs | 39 |
| Blocks with Failures | 35 |
| Failure Rate | 0.0005% |

### Top Failure Blocks

| Block | Failed | Total | Failure Rate |
|-------|--------|-------|--------------|
| 6304789 | 3 | 15,909 | 0.02% |
| 6303989 | 2 | 15,964 | 0.01% |
| 6305589 | 2 | 11,138 | 0.02% |
| **6305839** | **1** | **34** | **2.94%** |
| **6305889** | **1** | **36** | **2.78%** |

**Notable:** Blocks 6305839 and 6305889 had the highest failure rates (2.94% and 2.78%) - these are low-traffic blocks during a throughput transition.

---

## 2. TPS Spikes and Transitions

### Major Events

1. **Initial Ramp-up (Block 6257439-6257539)**
   - 21 TXs → 6,024 TXs → 32,231 TXs
   - **+32,210 transactions in 100 blocks**

2. **Peak Performance (Block 6258089)**
   - **32,321 transactions per block** (maximum observed)
   - Gas: 2,734,095,955

3. **Dramatic Crash (Block 6258389-6260289)**
   - 26,455 → 12,727 → 8,573 → 4,686 → 3,040 → 1,731 → 561 TXs
   - **98.3% throughput reduction**

4. **Second Ramp-up (Block 6301089-6302239)**
   - 21 → 6,028 → 15,957 TXs
   - Recovery to ~16K TPS sustained

### Full TPS Transition Timeline

```
Block 6257439: 21 TXs (baseline)
Block 6257489: 6,024 TXs (+6,003)
Block 6257539: 32,231 TXs (+26,207) ← SPIKE START
Block 6258089: 32,321 TXs ← PEAK
Block 6258389: 26,455 TXs
Block 6258439: 12,727 TXs (-13,728) ← CRASH BEGINS
Block 6258539: 4,686 TXs
Block 6260289: 561 TXs ← MINIMUM
Block 6301139: 6,028 TXs ← RECOVERY
Block 6302239: 15,957 TXs ← SUSTAINED
Block 6713000: 21,170 TXs ← CURRENT LEVEL
```

---

## 3. Gas Anomalies

### Statistics
- **Mean Gas:** 505,225,377
- **Std Dev:** 819,687,913
- **Anomalous Blocks (>2σ):** 15

### Top Gas Spikes

| Block | Gas Used | Deviation | TX Count |
|-------|----------|-----------|----------|
| 6258089 | 2,734,095,955 | +2.7σ | 32,321 |
| 6257539 | 2,719,991,919 | +2.7σ | 32,231 |
| 6257739 | 2,707,680,010 | +2.7σ | 32,022 |
| 6257589 | 2,707,241,024 | +2.7σ | 32,012 |
| 6257839 | 2,696,816,661 | +2.7σ | 31,847 |

All gas anomalies correlate with the TPS spike period (blocks 6257xxx-6258xxx).

---

## 4. TX Count Distribution

| Metric | Value |
|--------|-------|
| Minimum | 17 |
| Maximum | 32,321 |
| Mean | 4,835 |
| Median | 21 |
| Std Dev | 8,125 |

The **median of 21** vs **mean of 4,835** indicates the stress test blocks are outliers compared to normal operation.

---

## 5. Key Findings for Leena's Analysis

### Anomalies Found:
1. **Failed TXs:** 39 failures across 35 blocks
2. **TPS Spike:** 21 → 32,321 (+153,438% increase)
3. **TPS Crash:** 32,321 → 561 (-98.3% decrease)
4. **Gas Spikes:** 15 blocks >2σ above mean
5. **High Failure Rate Blocks:** 2.94% failure rate during transition periods

### Blocks to Investigate:
- **6304789** - Most failed TXs (3)
- **6305839** - Highest failure rate (2.94%)
- **6258089** - Peak gas/TPS block
- **6258439** - Crash initiation point

### Pattern Observed:
Failures concentrated in blocks 6303989-6305889, suggesting a specific event or contract behavior during this period.

---

## Data Files

- `sample1.csv` - Blocks 6242989-6400000 (1,317 samples)
- `sample2.csv` - Blocks 6400000-6426600 (134 samples)
- `sample3.csv` - Blocks 6550000-6563200 (67 samples)
- `sample4.csv` - Blocks 6700000-6713200 (67 samples)

---

*Report generated automatically from MegaETH stress test analysis*
