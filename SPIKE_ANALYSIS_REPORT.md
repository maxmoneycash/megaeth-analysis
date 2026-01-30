# MegaETH Stress Test Spike Analysis Report

**Date:** January 29, 2026
**Block Range:** 6,242,989 - 6,850,000 (607K blocks)
**Data Collected:** ~24.1 million transactions (partial, collection ongoing)

---

## 🚨 CRITICAL FINDING: state_growth Exceeds Limit by 6x

| Metric | Documented Limit | Actual Max (per block) | % of Limit |
|--------|-----------------|------------------------|------------|
| **state_growth** | 1,000 | **6,090** | **609%** ⚠️ |
| kv_updates | 125,000 | 40,546 | 32.4% |

**Implication:** Either MegaETH's limit is higher than documented, the limit isn't enforced, or their calculation differs from ours.

---

## Block-Level Resource Usage (Stress Test Blocks)

Analysis of 500 blocks from VM2 (blocks 6,394,742+):

| Metric | Mean | P50 | P99 | Max |
|--------|------|-----|-----|-----|
| **Transactions/block** | 16,038 | 16,037 | 16,055 | 16,101 |
| **kv_updates** | 40,243 | 40,242 | 40,318 | 40,546 |
| **state_growth** | 6,031 | 6,031 | 6,044 | 6,090 |
| **compute_gas** | 602M | 602M | 603M | 603M |
| **storage_gas** | 12.5B | 12.5B | 12.5B | 12.6B |
| **calldata_size** | 3.1M | 3.1M | 3.1M | 3.1M |
| **total_data_size** | 5.4M | 5.4M | 5.4M | 5.5M |

### Key Observations:
1. **Extremely uniform load** - P50 ≈ Mean ≈ Max indicates synthetic/automated traffic
2. **~16,000 txs per block** during stress test
3. **No variance** - real organic traffic would show much more variation

---

## Pre-Stress Test vs Stress Test Comparison

| Metric | Early Blocks (VM1) | Stress Test (VM2) | Increase |
|--------|-------------------|-------------------|----------|
| txs/block | 21 | 16,038 | **763x** |
| kv_updates/block | 198 | 40,243 | **203x** |
| state_growth/block | 31 | 6,031 | **195x** |

---

## Failed Transactions

| Type | Count (per 1M txs) |
|------|-------------------|
| Out of Gas (OOG) | 3 |
| Reverted | 0 |
| Other | 0 |

**Finding:** Virtually no failed transactions (0.0003%). This suggests:
- Well-tested synthetic traffic
- No real user errors or edge cases
- Transactions designed not to fail

---

## Heaviest Blocks by kv_updates

| Block | kv_updates | % of Limit | TX Count |
|-------|------------|------------|----------|
| 6395214 | 40,546 | 32.4% | 16,101 |
| 6394950 | 40,388 | 32.3% | 16,066 |
| 6394798 | 40,333 | 32.3% | 16,057 |
| 6394990 | 40,326 | 32.3% | 16,049 |
| 6395200 | 40,318 | 32.3% | 16,061 |

## Heaviest Blocks by state_growth

| Block | state_growth | % of Limit | TX Count |
|-------|--------------|------------|----------|
| 6395214 | 6,090 | **609%** | 16,101 |
| 6394950 | 6,063 | **606%** | 16,066 |
| 6394990 | 6,047 | **605%** | 16,049 |
| 6394969 | 6,045 | **604%** | 16,045 |
| 6394983 | 6,044 | **604%** | 16,043 |

---

## Data Collection Status

| VM | IP | Rows | Current Block | Status |
|---|---|---|---|---|
| VM1 | 137.184.57.29 | 296K | 6,257,000 | Running |
| VM2 | 188.166.250.5 | 8.96M | 6,395,301 | Running |
| VM3 | 143.198.89.110 | 7.50M | 6,546,850 | Running |
| VM4 | 152.42.224.34 | 7.34M | 6,698,596 | Running |
| **Total** | | **24.1M** | | |

**Estimated total when complete:** ~8 billion transactions

---

## CSV Column Reference (42 Metrics)

### Block Context (3)
- `block_number`, `block_timestamp`, `block_hash`

### Transaction Identity (5)
- `tx_hash`, `tx_index`, `from_address`, `to_address`, `value`

### Execution Status (2)
- `status`, `is_contract_creation`

### Gas Usage (4)
- `gas_limit`, `gas_used`, `gas_price`, `effective_gas_price`

### MegaETH Resource Limits (7) ⭐
- `compute_gas_used` - Pure computational workload
- `storage_gas_used` - Total storage gas
- `storage_gas_sstore` - From SSTORE operations
- `storage_gas_calldata` - From calldata
- `storage_gas_logs` - From LOG emissions
- `storage_gas_account_creation` - From new accounts
- `storage_gas_code_deposit` - From contract code

### State Metrics (2) ⭐⭐⭐
- `state_growth` - 0→non-0 SSTORE operations (limit: 1,000?)
- `kv_updates` - All SSTORE operations (limit: 125,000)

### Data Size (4)
- `calldata_size`, `calldata_zero_bytes`, `calldata_nonzero_bytes`
- `total_data_size`

### Failure Analysis (2)
- `failed_with_oog`, `failed_with_revert`

---

## Next Steps for Analysis

1. **Verify state_growth calculation** - Compare with MegaETH's methodology
2. **Time-series analysis** - Plot metrics over time to find spikes
3. **Address concentration** - Find top senders/receivers
4. **Contract classification** - Identify DEX, NFT, spam patterns
5. **Gas efficiency scoring** - Find poorly optimized contracts

---

## Download Data

```bash
gh release download v1.0-data --repo maxmoneycash/megaeth-analysis
cat megaeth-part2.csv.?? > megaeth-part2.csv
cat megaeth-part3.csv.?? > megaeth-part3.csv
cat megaeth-part4.csv.?? > megaeth-part4.csv
```

Live status: http://137.184.57.29/status.html
