# MegaViz Metrics Calculation

This document explains how MegaViz calculates and normalizes the 6 resource metrics for MegaETH blocks.

## Overview

MegaETH enforces **6 per-block resource limits** that constrain execution. MegaViz visualizes these as a radar with each metric mapped to a **-100 to +100 scale**, where:

- **0** = Median (typical) block usage
- **Negative scores** = Below typical usage
- **Positive scores** = Above typical usage
- **+100** = At or near protocol limit (capacity warning)

---

## The 6 Resource Metrics

### 1. Total Gas (`total_gas`)

**What it measures:** Total gas consumed by all transactions in the block.

**How we calculate it:**
```
block.gasUsed (from RPC)
```

**Protocol limit:** `30,000,000` gas per block

**Real baseline (500 blocks):**
| Percentile | Value |
|------------|-------|
| Min | 0 |
| P10 | 1,025,341 |
| P25 | 3,518,725 |
| Median | 6,666,252 |
| P75 | 10,814,922 |
| P90 | 14,982,136 |
| Max | 28,451,392 |
| IQR | 7,296,197 |

**Typical utilization:** ~22% of limit

---

### 2. KV Updates (`kv_updates`)

**What it measures:** Number of key-value storage operations (SSTORE).

**How we calculate it:**
```rust
// Estimated from gas usage (SSTORE costs ~20,000 gas)
kv_updates = max(total_gas / 20_000, tx_count)
```

**Protocol limit:** `500,000` KV updates per block

**Real baseline (500 blocks):**
| Percentile | Value |
|------------|-------|
| Min | 0 |
| P10 | 51 |
| P25 | 175 |
| Median | 333 |
| P75 | 540 |
| P90 | 749 |
| Max | 1,422 |
| IQR | 365 |

**Typical utilization:** ~0.07% of limit

---

### 3. Transaction Size (`tx_size`)

**What it measures:** Total serialized size of all transactions in bytes.

**How we calculate it:**
```rust
// EIP-2718 encoded transaction size
for tx in block.transactions {
    tx_size += tx.input.len() + 100  // ~100 bytes overhead per tx
}
```

For exact calculation, use `Encodable2718::encode_2718_len()`.

**Protocol limit:** `1,000,000` bytes per block

**Real baseline (500 blocks):**
| Percentile | Value |
|------------|-------|
| Min | 0 |
| P10 | 1,976 |
| P25 | 4,630 |
| Median | 8,564 |
| P75 | 14,782 |
| P90 | 22,596 |
| Max | 75,218 |
| IQR | 10,152 |

**Typical utilization:** ~0.86% of limit

---

### 4. DA Size (`da_size`)

**What it measures:** Compressed transaction data size for Data Availability layer.

**How we calculate it:**
```rust
// Uses FastLZ compression (same as MegaETH)
da_size = op_alloy_flz::tx_estimated_size_fjord_bytes(tx_bytes)

// Note: Deposit transactions (type 0x7e) are exempt
```

**Protocol limit:** `1,000,000` bytes per block

**Real baseline (500 blocks):**
| Percentile | Value |
|------------|-------|
| Min | 0 |
| P10 | 1,185 |
| P25 | 2,778 |
| Median | 5,138 |
| P75 | 8,869 |
| P90 | 13,557 |
| Max | 45,130 |
| IQR | 6,091 |

**Typical utilization:** ~0.51% of limit

---

### 5. Data Size (`data_size`)

**What it measures:** Total calldata + estimated log data size.

**How we calculate it:**
```rust
data_size = total_input_bytes + (tx_count * 200)  // ~200 bytes logs per tx
```

**Protocol limit:** `10,000,000` bytes per block

**Real baseline (500 blocks):**
| Percentile | Value |
|------------|-------|
| Min | 0 |
| P10 | 3,276 |
| P25 | 6,130 |
| Median | 9,864 |
| P75 | 15,982 |
| P90 | 23,396 |
| Max | 73,018 |
| IQR | 9,852 |

**Typical utilization:** ~0.10% of limit

---

### 6. State Growth (`state_growth`)

**What it measures:** Net new storage slots created.

**How we calculate it:**
```rust
// Estimated as fraction of KV updates (most are updates, not creates)
state_growth = kv_updates / 5
```

**Protocol limit:** `100,000` new slots per block

**Real baseline (500 blocks):**
| Percentile | Value |
|------------|-------|
| Min | 0 |
| P10 | 10 |
| P25 | 35 |
| Median | 66 |
| P75 | 108 |
| P90 | 149 |
| Max | 284 |
| IQR | 73 |

**Typical utilization:** ~0.07% of limit

---

## Normalization Algorithm

We use **Hybrid Sigmoid + Capacity Warning** to map raw values to the -100 to +100 scale.

### Step 1: Establish Baseline

Collect metrics from a **10-minute rolling window** (~6000 blocks at 100ms block time) using reservoir sampling (max 2000 samples for memory efficiency).

### Step 2: Compute Percentiles

For each metric, calculate:
- **Median** (P50): The "typical" value
- **IQR** (Interquartile Range): P75 - P25, measures spread

### Step 3: Sigmoid Normalization

```
spread = IQR * 1.5
x = (value - median) / spread
score = tanh(x) * 100
```

This produces:
- Values at median → score ≈ 0
- Values at P25 → score ≈ -30
- Values at P75 → score ≈ +30
- Extreme values → asymptotically approach ±100

### Step 4: Capacity Warning Override

If utilization exceeds 50% of protocol limit, override with utilization-based score:

```
if utilization > 0.5:
    capacity_score = utilization * 100
    score = max(score, capacity_score)
```

This ensures blocks approaching protocol limits show high positive scores regardless of what's "typical".

---

## Example: Block #7232302

A real block with 12 transactions:

| Metric | Raw Value | Normalized Score | Utilization |
|--------|-----------|------------------|-------------|
| Gas | 6,369,578 | -25.4 | 21.23% |
| KV Updates | 318 | -25.7 | 0.06% |
| Tx Size | 7,845 | -12.1 | 0.78% |
| DA Size | 4,707 | -11.8 | 0.47% |
| Data Size | 9,245 | -10.5 | 0.09% |
| State Growth | 63 | -12.8 | 0.06% |

**Interpretation:** This block is slightly below typical usage across all metrics (negative scores), using ~20% of gas capacity.

---

## Protocol Limits Summary

| Metric | Limit | Typical Usage |
|--------|-------|---------------|
| Total Gas | 30,000,000 | ~22% |
| KV Updates | 500,000 | ~0.07% |
| Tx Size | 1,000,000 bytes | ~0.86% |
| DA Size | 1,000,000 bytes | ~0.51% |
| Data Size | 10,000,000 bytes | ~0.10% |
| State Growth | 100,000 slots | ~0.07% |

**Note:** MegaETH blocks are typically well below capacity limits. Gas is the most utilized resource at ~22% of limit on average.

---

## Running the Baseline Calculator

To fetch fresh baseline data from MegaETH:

```bash
cd api
cargo run --bin fetch_baseline
```

This fetches 500 recent blocks and outputs percentile statistics for each metric.

---

## Source Code

- **Normalization logic:** `src/metrics/rolling_stats.rs`
- **Baseline fetcher:** `src/bin/fetch_baseline.rs`
- **Protocol limits:** `src/metrics/rolling_stats.rs` → `limits` module
