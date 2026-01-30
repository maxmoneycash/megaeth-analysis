# MegaETH Stress Test Deep Analysis

**Analysis Date:** 2026-01-29
**Focus:** Congestion, Gas Spikes, and System Behavior Under Load

---

## Executive Summary

The MegaETH stress test revealed significant performance degradation under load:
- **98.3% TPS crash** from peak 32,321 → 561 transactions per block
- **Gas spikes** reaching 2.73 billion per block (27.3% of 10B limit)
- **41 blocks with failed transactions** during high-load periods
- **Single contract** consumed 5.7B+ gas across the stress test

---

## 1. TPS Crash Analysis

### Timeline of the Crash

| Block | TXs | Change | Gas Used | Gas % |
|-------|-----|--------|----------|-------|
| 6258089 | 32,321 | PEAK | 2,734,095,955 | 27.3% |
| 6258139 | 30,536 | -5.5% | 2,605,047,851 | 26.1% |
| 6258239 | 29,500 | -3.4% | 2,450,204,374 | 24.5% |
| 6258339 | 28,401 | -3.7% | 1,866,649,439 | 18.7% |
| 6258389 | 26,455 | -6.9% | 1,764,982,574 | 17.6% |
| **6258439** | **12,727** | **-51.9%** | 864,416,867 | 8.6% |
| 6258489 | 8,573 | -32.6% | 633,248,494 | 6.3% |
| 6258539 | 4,686 | -45.3% | 401,591,693 | 4.0% |
| 6258589 | 3,040 | -35.1% | 257,686,046 | 2.6% |
| 6258889 | 1,731 | - | 185,905,739 | 1.9% |
| 6260289 | 561 | BOTTOM | 95,665,847 | 1.0% |

### Key Observation: Block 6258439 was the cliff
- **51.9% drop in a single block** (26,455 → 12,727)
- Network went from processing 26K txs to 12K in ~1 second
- This suggests a hard limit or resource exhaustion was hit

### Gas Per Transaction Anomaly

As TPS dropped, **gas per transaction INCREASED**:
- Peak (32K TXs): 84,591 gas/tx
- Bottom (561 TXs): 170,527 gas/tx (+101.5%)

This indicates heavier transactions were queueing up while lighter ones failed to process.

---

## 2. Gas Spike Analysis

### Peak Gas Block: 6258089
- **Total Gas:** 2,734,095,955 (2.73B)
- **Gas Limit:** 10,000,000,000 (10B)
- **Utilization:** 27.3%
- **Unique Senders:** 26,044
- **Unique Receivers:** 20,330

### Top Gas-Consuming Contract

**Contract:** `0xaab1c664cead881afbb58555e6a3a79523d3e4c0`
- **Total Gas Consumed:** 5,716,570,429 (5.7B+)
- **Transaction Count:** 30,068
- **Average Gas/TX:** 190,121
- **Code Size:** 19,540 bytes

This single contract consumed **over 40% of all gas** during the stress test peak.

### Most Expensive Transaction Type

**Contract:** `0x897a33a0af45b3ba097bd6045187d622252e6acd`
- **Average Gas/TX:** 579,569 (6.8x average)
- **Code Size:** 2,227 bytes
- **All top 20 expensive txs** went to this contract

---

## 3. Failed Transactions Analysis

### Failure Distribution

| Metric | Value |
|--------|-------|
| Total Failed TXs | 45 |
| Blocks with Failures | 41 |
| Overall Failure Rate | 0.0004% |
| Peak Failure Rate | 2.94% (block 6305839) |

### High-Failure Blocks

| Block | Failed | Total | Rate | Context |
|-------|--------|-------|------|---------|
| 6305839 | 1 | 34 | 2.94% | Low-traffic transition |
| 6305889 | 1 | 36 | 2.78% | Low-traffic transition |
| 6304789 | 3 | 15,909 | 0.02% | Stress period |
| 6303989 | 2 | 15,964 | 0.01% | Stress period |

### Failure Cluster
Blocks 6303989-6305889 contain **25+ failures** concentrated in ~2000 blocks.
This suggests a specific event or contract behavior caused cascading failures.

---

## 4. Network Behavior Under Load

### Congestion Indicators

1. **Queue Buildup**: Avg gas/tx doubled at minimum TPS (84K → 170K)
2. **Sender Reduction**: Unique senders dropped from 26K to 509 (98% reduction)
3. **Receiver Concentration**: At bottom, only 86 unique receivers vs 20K at peak

### System Contract Activity

**Contract:** `0x6342000000000000000000000000000000000001`
- Address pattern suggests system/precompile contract
- 76,482 avg gas/tx
- Present across all stress test blocks

---

## 5. Contracts to Investigate

### Primary Targets

1. **0xaab1c664cead881afbb58555e6a3a79523d3e4c0**
   - Consumed 5.7B+ gas
   - 30K+ transactions
   - What is this contract doing?

2. **0x897a33a0af45b3ba097bd6045187d622252e6acd**
   - Most expensive txs (579K gas each)
   - 676-byte input data
   - Complex operation pattern

3. **System contract 0x634200...0001**
   - Check what system function this represents

---

## 6. Replayable Data

### Blocks for Replay Testing

| Block | Characteristic | Use Case |
|-------|---------------|----------|
| 6258089 | Peak load (32K TXs) | Maximum stress test |
| 6258439 | Crash initiation (-51.9%) | Failure mode testing |
| 6305839 | Highest failure rate (2.94%) | Transaction failure analysis |
| 6304789 | Most failures (3) | Batch failure analysis |
| 6260289 | Minimum TPS (561) | Recovery analysis |

### Transaction Hashes for Analysis

**Most Expensive TXs:**
- `0xa3be91d86287d04d2c39bb48ef8a8b13095b92140d2fe6df0b609014a69dea33` (579,892 gas)
- `0xa852b90972f7d714cba8c4a92f617d91739ddd3739c843b187f80abfdd8d2e47` (579,882 gas)
- `0x8d9074d7a11cd6df70536cd699750b3d86409e0776b3f64feff01fdf9ec00f2e` (579,879 gas)

---

## 7. Key Findings for Comparison

### What the Data Shows

1. **MegaETH handled 32K TXs/block at peak** but could not sustain it
2. **TPS crashed 98.3%** within ~100 blocks (~100 seconds)
3. **Gas utilization never exceeded 27.3%** of the 10B limit
4. **Failures concentrated** in specific block ranges, not distributed
5. **Single contract dominated** gas consumption (40%+ of total)

### Questions for Investigation

- Why did TPS crash at only 27% gas utilization?
- What triggered the 51.9% drop at block 6258439?
- Why are failures clustered in blocks 6303989-6305889?
- What operations does the 5.7B-gas contract perform?

---

## Data Files

- `crash_analysis.csv` - Block-by-block crash timeline
- `expensive_transactions.csv` - Top gas-consuming transactions
- `contract_gas_usage.csv` - Gas usage by contract
- `sample1-4.csv` - Full sample data across block range
- `failed_blocks_detail.csv` - All blocks with failures

---

*Generated from MegaETH stress test analysis - blocks 6,242,989 to 6,850,000*
