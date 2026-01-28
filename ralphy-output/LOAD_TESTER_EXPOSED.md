# MegaETH Load Tester EXPOSED

**Date:** January 22, 2026
**Status:** CONFIRMED SYNTHETIC LOAD TESTING

---

## EXECUTIVE SUMMARY

MegaETH's "stress test" is **99.9% synthetic bot traffic**. We have identified and exposed the exact patterns being used.

---

## THE EVIDENCE

### 1. Traffic Breakdown (Single Block Analysis)

| Traffic Type | Count | Percentage | Description |
|-------------|-------|------------|-------------|
| **3-wei self-transfers** | 10,000 | 62.4% | Wallets sending 3 wei to THEMSELVES |
| **DEX swap spam** | 6,002 | 37.5% | UniversalRouter execute() calls |
| **Organic transactions** | 1 | 0.01% | Real user activity |

**Total: 16,019 transactions, only 1 is real.**

---

### 2. The 3-Wei Self-Transfer Pattern

```
Pattern: Wallet sends EXACTLY 3 wei to ITSELF
Count: 10,000 transactions per block
Unique wallets: 9,095
```

This is the **SIGNATURE** of automated synthetic load testing:
- No economic purpose (3 wei = $0.000000000000000003)
- Self-transfer (no counterparty)
- Exact amount (not random)
- Mass coordinated execution

---

### 3. The DEX Swap Spam

```
Target Contract: 0xaab1c664cead881afbb58555e6a3a79523d3e4c0 (UniversalRouter)
Function: 0x3593564c (execute)
Count: 6,002 transactions per block (~37.5%)
```

All swap transactions:
- Call the same function
- Have identical input data length (1034 bytes)
- Come from ~6,000 unique wallets

---

### 4. Wallet Statistics

```
Total unique senders: 66,209 (across multiple blocks)
Single-tx wallets: 53.6%
Pattern: Each wallet sends 1-3 txs then never used again
```

This is a **coordinated bot farm** with pre-generated wallets.

---

### 5. TPS Cycling CONFIRMED

The load tester **cycles ON and OFF**:

| State | TPS Range | Observation |
|-------|-----------|-------------|
| ON (full) | 14,000-17,000 | Sustained synthetic load |
| ON (partial) | 1,000-5,000 | Ramping up/down |
| OFF | 20-50 | Only organic traffic |

**User observed:** 13.3K → 20 → 1.4K → 3K → 16K fluctuations

This is NOT a UI bug - it's real network behavior. The load tester cycles.

---

## BOT WALLET ADDRESSES EXPOSED

Top sender addresses from load testing:

```
0xa887dcb9d5f39ef79272801d05abdf707cfbbd1d
0xd5b17d00a53eaf600091f8046d309587c61b65d0
0x4780bb20c0293b4b5e00c80a350acab467300d2e
0x6a4d1b2fc6a894928979f152a8c9245d96860604
0x1ef5ca39f708a3ffa71d1101b8d5ced1e73c3803
0x17e2609e18f9ae7667467695dc701ce3865464ef
0xbbd80bef77fd96b1d7d5db0614af5cb7b3d1d71f
0x50dac688288fedd6a7113f94eac289a4d7854459
0x02f04985014bd072a72a3f782b021328fa9d349b
0xe3b359b45ee14d0fa7233fb2356bfbc67e8b3fb1
```

---

## TARGET CONTRACT

```
UniversalRouter: 0xaab1c664cead881afbb58555e6a3a79523d3e4c0
Function: execute() (0x3593564c)
Purpose: Fake DEX swap activity
```

---

## METHODOLOGY

### Scripts Used:
1. `wallet-expose.mjs` - Identifies sender wallets
2. `dust-transfer-expose.mjs` - Analyzes transaction types
3. WebSocket mini-block streaming - Real-time TPS monitoring

### Data Sources:
- MegaETH RPC: `https://mainnet.megaeth.com/rpc`
- WebSocket: `wss://carrot.megaeth.com/ws`

---

## CONCLUSION

MegaETH's "stress test" is:

1. **99.9% synthetic** - Only 1 real transaction per block
2. **Coordinated bot farm** - 9,000+ wallets per block
3. **Two spam techniques**:
   - 3-wei self-transfers (62.4%)
   - DEX swap spam (37.5%)
4. **Cycling on/off** - TPS fluctuates between 20 and 16,000+

The TPS claims are technically accurate but **completely misleading** - the network can process 16K TPS, but only because 99.9% of those transactions are bots sending 3 wei to themselves.

---

**Note:** IP addresses cannot be determined from blockchain data alone. The wallets are exposed, but tracing them to infrastructure requires off-chain investigation (node operator logs, RPC provider data).

---

*Investigation by MegaViz - January 22, 2026*
