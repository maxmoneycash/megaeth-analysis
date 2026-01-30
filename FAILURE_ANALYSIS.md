# MegaETH Transaction Failure Analysis

**Analysis Date:** 2026-01-29

---

## Executive Summary

Analysis of 15 failed transactions from the MegaETH stress test reveals:
- **73% (11/15) were OUT-OF-GAS failures**
- **60% (9/15) targeted the same contract**
- **Root cause:** Insufficient gas limits provided by senders

---

## 1. Failure Contract Analysis

### Primary Failure Target
**Contract:** `0x7f0b304d576cdc5ba390a0545e28b5903ed56cf8`

| Metric | Value |
|--------|-------|
| Code Size | 5,886 bytes |
| Failed Calls | 9 of 15 total failures |
| Success Gas | ~85,000 |
| Failure Pattern | 100% gas consumed |

### Function Signatures Failing

| Signature | Calls | Gas Limit | Input Size |
|-----------|-------|-----------|------------|
| `0xcb6bcce1` | 4 | 100,000 | 4 bytes |
| `0xb548f28d` | 1 | 200,000 | 68 bytes |

### Contract Characteristics
- Contains **loop constructs** (JUMPDEST patterns)
- Uses **CODECOPY** - copies code extensively
- Makes **external calls** (EXTCODESIZE)
- All these are expensive EVM operations

---

## 2. Failure Breakdown by Block

| Block | Failed | Total TXs | Rate | Receiver Contract |
|-------|--------|-----------|------|-------------------|
| 6305839 | 1 | 34 | **2.94%** | 0x7f0b304... |
| 6305889 | 1 | 36 | **2.78%** | 0x7f0b304... |
| 6304789 | 3 | 15,909 | 0.02% | 0x7f0b304... (3) |
| 6303989 | 2 | 15,964 | 0.01% | 0x7f0b304... (2) |
| 6305589 | 2 | 11,138 | 0.02% | Mixed |
| 6257739 | 1 | 32,022 | 0.003% | 0x1ba9be96... |
| 6410800 | 1 | 16,060 | 0.006% | 0xf279bb59... |
| 6414000 | 1 | 16,072 | 0.006% | 0x1ba9be96... |
| 6560200 | 1 | 21,077 | 0.005% | 0x7f0b304... |
| 6561400 | 1 | 21,101 | 0.005% | 0x7f0b304... |
| 6562000 | 1 | 21,087 | 0.005% | 0x7f0b304... |

---

## 3. Failure Types

### Out-of-Gas Failures (11 of 15)
Transactions that consumed 100% of their gas limit:

| TX Hash | Block | Gas Used | Gas Limit |
|---------|-------|----------|-----------|
| 0xdc36efb4... | 6304789 | 100,000 | 100,000 |
| 0x1cee6cbe... | 6304789 | 100,000 | 100,000 |
| 0x0c6321a0... | 6304789 | 100,000 | 100,000 |
| 0xb37960d3... | 6303989 | 100,000 | 100,000 |
| 0xac503a11... | 6303989 | 100,000 | 100,000 |
| 0xb62c3d63... | 6305589 | 100,000 | 100,000 |
| 0x1fd2d05c... | 6305839 | 100,000 | 100,000 |
| 0x1896f473... | 6305889 | 300,000 | 300,000 |
| 0x2641c8ff... | 6560200 | 200,000 | 200,000 |
| 0xc23c8da1... | 6561400 | 200,000 | 200,000 |
| 0x0014addc... | 6562000 | 200,000 | 200,000 |

### Partial Gas Usage Failures (4 of 15)
Transactions that failed before exhausting gas:

| TX Hash | Block | Gas Used | Gas Limit | % Used |
|---------|-------|----------|-----------|--------|
| 0xbf96b024... | 6257739 | 296,110 | 600,000 | 49.4% |
| 0x846d75e2... | 6305589 | 138,799 | 5,000,000 | 2.8% |
| 0x5975c1bb... | 6410800 | 135,290 | 3,000,000 | 4.5% |
| 0xf473ce2e... | 6414000 | 296,110 | 600,000 | 49.4% |

These failures indicate **revert conditions** in the contract logic.

---

## 4. Unique Senders Analysis

12 unique addresses sent the 15 failed transactions:

| Sender | Failed TXs | Pattern |
|--------|------------|---------|
| 0x3d9dbe42... | 3 | Same contract, OOG |
| 0xe936781... | 2 | Same contract, OOG |
| Others | 1 each | Various |

---

## 5. Key Findings

### What Caused Failures

1. **Insufficient Gas Limits**
   - Users provided 100K-200K gas
   - Contract operations require ~85K+ gas
   - Any loop iteration or external call pushes over limit

2. **Complex Contract Logic**
   - Contract `0x7f0b304...` has loops and external calls
   - EVM charges for every operation
   - Under load, gas estimation may have been off

3. **Revert Conditions**
   - 4 failures used only 2.8-49.4% of gas
   - Contract logic explicitly reverted
   - Likely state-dependent failures (insufficient balance, wrong params, etc.)

### Network Behavior Under Load

- **Failures clustered** in specific block ranges
- **High-failure-rate blocks** occurred during traffic transitions (low TXs/block)
- **No failures during peak load** (32K TXs/block had only 1 failure)

---

## 6. Contracts Involved in Failures

| Contract | Failures | Code Size | Purpose |
|----------|----------|-----------|---------|
| 0x7f0b304d576cdc5ba390a0545e28b5903ed56cf8 | 9 | 5,886 bytes | Unknown - needs investigation |
| 0x1ba9be96a5c21dcdb9d22bec3f00abcb6336fd65 | 2 | TBD | Unknown |
| 0xa05096db49a8af37ab0f40f871f649a77fca58ce | 1 | TBD | Unknown |
| 0xf279bb598e92c161c2fe7f455d5c44f0c469b78e | 1 | TBD | Unknown |

---

## 7. Transaction Hashes for Replay

### Out-of-Gas (for gas analysis)
```
0xdc36efb4c5d29b25914294d8b84933482149846dee3780782083afc85c1baacd
0x1cee6cbe4e9be50057312b4c643739e2cefc8d9f3882667d309fedd5525b490a
0xb37960d374a8562745a59deb830c24c090c6ea9736b354dc918076272df50fb7
0x1fd2d05ce647c8ca1eabfeda01edc51fddf3bbcee652be60cec2abb9d678e753
```

### Revert Failures (for logic analysis)
```
0xbf96b024d450c418a6125207a82e3065f44b7acbc18f4f21cf9cea92c0fae2ae
0x846d75e2502578213244666cbd132267202d82b02b35817f8fd1176b4d5ea433
0x5975c1bb7ef1b1dd383a343f634005eba4413f9486040907d69c48ce791557cf
0xf473ce2e83ed717c27a0f34d8d3f09b310fd15b036a5dbbadc7e60c8607c193f
```

---

## Data Files

- `failed_tx_details.csv` - All 15 failed transactions with full details
- `STRESS_TEST_DEEP_ANALYSIS.md` - Overall stress test analysis
- `crash_analysis.csv` - TPS crash timeline

---

*Analysis complete - 15 failed transactions identified and categorized*
