#!/usr/bin/env python3
"""
Analyze MegaETH transactions to find:
1. Most expensive transactions by gas
2. Group by type (AMM swap, token transfer, other)
3. Correlate with latency spikes

Uses VIP RPC endpoint for no rate limits.
"""

import requests
import json
import csv
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict
import statistics

# VIP RPC endpoint
RPC_URL = "https://mainnet.megaeth.com/rpc?vip=1&u=DominoGirlV1&v=5184000&s=mafia&verify=1769441404-Z7QuERFgqJPYL%2BIdRrwjch1mx2alQifeOiXH%2FaeQdEc%3D"

# Common method signatures (first 4 bytes of keccak256 hash)
METHOD_SIGNATURES = {
    # ERC-20 Token Transfers
    "0xa9059cbb": "transfer",           # transfer(address,uint256)
    "0x23b872dd": "transferFrom",       # transferFrom(address,address,uint256)
    "0x095ea7b3": "approve",            # approve(address,uint256)

    # Uniswap V2 style
    "0x38ed1739": "swapExactTokensForTokens",
    "0x8803dbee": "swapTokensForExactTokens",
    "0x7ff36ab5": "swapExactETHForTokens",
    "0x4a25d94a": "swapTokensForExactETH",
    "0x18cbafe5": "swapExactTokensForETH",
    "0xfb3bdb41": "swapETHForExactTokens",

    # Uniswap V3 style
    "0x414bf389": "exactInputSingle",
    "0xc04b8d59": "exactInput",
    "0xdb3e2198": "exactOutputSingle",
    "0xf28c0498": "exactOutput",
    "0x5ae401dc": "multicall",          # V3 multicall (often wraps swaps)

    # Common DEX aggregators
    "0x12aa3caf": "swap (1inch)",
    "0xe449022e": "uniswapV3Swap (1inch)",
    "0x0502b1c5": "unoswap (1inch)",

    # Liquidity
    "0xe8e33700": "addLiquidity",
    "0xf305d719": "addLiquidityETH",
    "0xbaa2abde": "removeLiquidity",
    "0x02751cec": "removeLiquidityETH",

    # Dust/spam patterns (transfers with tiny amounts)
    "0x": "native ETH transfer",
}

# Categorize method into high-level type
def categorize_method(method_id, value, gas_used):
    """Categorize a transaction by its method signature."""
    if not method_id or method_id == "0x":
        # Native ETH transfer
        if value and int(value, 16) < 1000:  # Tiny value = dust
            return "DUST_TRANSFER"
        return "ETH_TRANSFER"

    method_4byte = method_id[:10].lower() if len(method_id) >= 10 else method_id.lower()

    # Check for known methods
    method_name = METHOD_SIGNATURES.get(method_4byte, "")

    if "swap" in method_name.lower() or "multicall" in method_name.lower():
        return "AMM_SWAP"
    elif method_name in ["transfer", "transferFrom"]:
        # Check if it's a dust transfer (low gas = simple transfer)
        if gas_used and gas_used < 30000:
            return "DUST_TRANSFER"
        return "TOKEN_TRANSFER"
    elif method_name == "approve":
        return "APPROVAL"
    elif "Liquidity" in method_name:
        return "LIQUIDITY"
    elif method_4byte == "0xa9059cbb":  # transfer
        return "TOKEN_TRANSFER"
    else:
        return "OTHER"


def get_block_with_txs(block_num):
    """Fetch a block with full transaction data."""
    payload = {
        "jsonrpc": "2.0",
        "method": "eth_getBlockByNumber",
        "params": [hex(block_num), True],  # True = include full tx objects
        "id": block_num
    }
    try:
        resp = requests.post(RPC_URL, json=payload, timeout=30)
        data = resp.json()
        if "result" in data and data["result"]:
            return data["result"]
    except Exception as e:
        print(f"Error fetching block {block_num}: {e}")
    return None


def analyze_transactions(block):
    """Analyze all transactions in a block."""
    if not block or "transactions" not in block:
        return []

    block_num = int(block["number"], 16)
    block_ts = int(block["timestamp"], 16)
    block_gas = int(block["gasUsed"], 16)

    tx_analyses = []

    for tx in block["transactions"]:
        try:
            gas_used = int(tx.get("gas", "0x0"), 16)
            gas_price = int(tx.get("gasPrice", "0x0"), 16)
            value = tx.get("value", "0x0")
            input_data = tx.get("input", "0x")

            # Calculate gas cost in ETH
            gas_cost_wei = gas_used * gas_price
            gas_cost_eth = gas_cost_wei / 1e18

            # Categorize transaction
            tx_type = categorize_method(input_data, value, gas_used)

            tx_analyses.append({
                "block_number": block_num,
                "timestamp": block_ts,
                "timestamp_iso": datetime.utcfromtimestamp(block_ts).isoformat() + "Z",
                "tx_hash": tx["hash"],
                "from": tx.get("from", ""),
                "to": tx.get("to", ""),
                "gas_used": gas_used,
                "gas_price_gwei": gas_price / 1e9,
                "gas_cost_eth": gas_cost_eth,
                "value_eth": int(value, 16) / 1e18 if value else 0,
                "tx_type": tx_type,
                "method_id": input_data[:10] if len(input_data) >= 10 else input_data,
            })
        except Exception as e:
            continue

    return tx_analyses


def load_latency_data():
    """Load our historical latency/performance data."""
    latency_by_block = {}
    try:
        with open("historical_blocks.csv") as f:
            reader = csv.DictReader(f)
            for row in reader:
                block_num = int(row["block_number"])
                latency_by_block[block_num] = {
                    "gas_mgas": float(row["gas_mgas"]) if row["gas_mgas"] else None,
                    "tps": float(row["tps"]) if row["tps"] else None,
                    "anomalies": row.get("anomalies", ""),
                }
    except Exception as e:
        print(f"Warning: Could not load historical data: {e}")
    return latency_by_block


def main():
    print("=" * 70)
    print("MegaETH Transaction Analyzer")
    print("=" * 70)

    # Load existing latency data to find anomaly blocks
    print("\nLoading historical performance data...")
    latency_data = load_latency_data()
    print(f"  Loaded {len(latency_data)} block records")

    # Find blocks with anomalies
    anomaly_blocks = [b for b, data in latency_data.items() if data.get("anomalies")]
    print(f"  Found {len(anomaly_blocks)} blocks with anomalies")

    # Get latest block
    resp = requests.post(RPC_URL, json={"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}, timeout=10)
    latest_block = int(resp.json()["result"], 16)
    print(f"\nLatest block: {latest_block:,}")

    # Sample blocks to analyze:
    # 1. Recent blocks (last 1000)
    # 2. Blocks around anomalies
    # 3. Random sample from our data range

    blocks_to_analyze = set()

    # Recent blocks (sample every 100)
    for b in range(latest_block - 1000, latest_block, 100):
        blocks_to_analyze.add(b)

    # Blocks around anomalies (±5 blocks from each anomaly)
    for anomaly_block in anomaly_blocks[:20]:  # Limit to first 20 anomalies
        for offset in range(-5, 6):
            blocks_to_analyze.add(anomaly_block + offset)

    # Sample from full range
    import random
    all_blocks = list(latency_data.keys())
    if all_blocks:
        sample_blocks = random.sample(all_blocks, min(50, len(all_blocks)))
        blocks_to_analyze.update(sample_blocks)

    blocks_to_analyze = sorted(blocks_to_analyze)
    print(f"\nAnalyzing {len(blocks_to_analyze)} blocks...")

    # Fetch and analyze blocks
    all_txs = []

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(get_block_with_txs, b): b for b in blocks_to_analyze}
        done = 0
        for future in as_completed(futures):
            done += 1
            block = future.result()
            if block:
                txs = analyze_transactions(block)
                all_txs.extend(txs)
            if done % 20 == 0:
                print(f"  Progress: {done}/{len(blocks_to_analyze)} blocks, {len(all_txs)} txs")

    print(f"\nAnalyzed {len(all_txs):,} transactions")

    if not all_txs:
        print("No transactions found!")
        return

    # === ANALYSIS ===

    # 1. Group by transaction type
    print("\n" + "=" * 70)
    print("TRANSACTION TYPE BREAKDOWN")
    print("=" * 70)

    by_type = defaultdict(list)
    for tx in all_txs:
        by_type[tx["tx_type"]].append(tx)

    type_stats = []
    for tx_type, txs in sorted(by_type.items(), key=lambda x: -len(x[1])):
        gas_values = [t["gas_used"] for t in txs]
        cost_values = [t["gas_cost_eth"] for t in txs]

        type_stats.append({
            "type": tx_type,
            "count": len(txs),
            "pct": len(txs) / len(all_txs) * 100,
            "avg_gas": statistics.mean(gas_values),
            "max_gas": max(gas_values),
            "total_gas": sum(gas_values),
            "avg_cost_eth": statistics.mean(cost_values),
            "total_cost_eth": sum(cost_values),
        })

        print(f"\n{tx_type}:")
        print(f"  Count: {len(txs):,} ({len(txs)/len(all_txs)*100:.1f}%)")
        print(f"  Avg gas: {statistics.mean(gas_values):,.0f}")
        print(f"  Max gas: {max(gas_values):,}")
        print(f"  Total gas: {sum(gas_values):,}")

    # 2. Most expensive transactions
    print("\n" + "=" * 70)
    print("TOP 20 MOST EXPENSIVE TRANSACTIONS (by gas)")
    print("=" * 70)

    top_gas = sorted(all_txs, key=lambda x: -x["gas_used"])[:20]
    expensive_txs = []

    for i, tx in enumerate(top_gas, 1):
        # Check if this block had performance issues
        block_perf = latency_data.get(tx["block_number"], {})
        anomaly = block_perf.get("anomalies", "")

        expensive_txs.append({
            "rank": i,
            "tx_hash": tx["tx_hash"],
            "type": tx["tx_type"],
            "gas_used": tx["gas_used"],
            "gas_cost_eth": tx["gas_cost_eth"],
            "block": tx["block_number"],
            "timestamp": tx["timestamp_iso"],
            "anomaly_at_time": anomaly,
        })

        print(f"\n{i}. {tx['tx_type']}")
        print(f"   Hash: {tx['tx_hash'][:20]}...")
        print(f"   Gas: {tx['gas_used']:,}")
        print(f"   Block: {tx['block_number']} @ {tx['timestamp_iso']}")
        if anomaly:
            print(f"   ⚠️  ANOMALY: {anomaly}")

    # 3. Correlate with anomalies
    print("\n" + "=" * 70)
    print("CORRELATION: TX TYPES DURING ANOMALIES vs NORMAL")
    print("=" * 70)

    # Separate txs during anomalies vs normal
    anomaly_txs = [tx for tx in all_txs if latency_data.get(tx["block_number"], {}).get("anomalies")]
    normal_txs = [tx for tx in all_txs if not latency_data.get(tx["block_number"], {}).get("anomalies")]

    print(f"\nTransactions during anomalies: {len(anomaly_txs):,}")
    print(f"Transactions during normal: {len(normal_txs):,}")

    if anomaly_txs and normal_txs:
        print("\nType distribution during ANOMALIES:")
        anomaly_by_type = defaultdict(int)
        for tx in anomaly_txs:
            anomaly_by_type[tx["tx_type"]] += 1
        for t, c in sorted(anomaly_by_type.items(), key=lambda x: -x[1]):
            print(f"  {t}: {c} ({c/len(anomaly_txs)*100:.1f}%)")

        print("\nType distribution during NORMAL:")
        normal_by_type = defaultdict(int)
        for tx in normal_txs:
            normal_by_type[tx["tx_type"]] += 1
        for t, c in sorted(normal_by_type.items(), key=lambda x: -x[1]):
            print(f"  {t}: {c} ({c/len(normal_txs)*100:.1f}%)")

        # Calculate if certain tx types are MORE common during anomalies
        print("\nAnomaly correlation (higher = more common during issues):")
        for tx_type in set(list(anomaly_by_type.keys()) + list(normal_by_type.keys())):
            anomaly_pct = anomaly_by_type.get(tx_type, 0) / len(anomaly_txs) * 100 if anomaly_txs else 0
            normal_pct = normal_by_type.get(tx_type, 0) / len(normal_txs) * 100 if normal_txs else 0
            if normal_pct > 0:
                ratio = anomaly_pct / normal_pct
                indicator = "⬆️" if ratio > 1.2 else "⬇️" if ratio < 0.8 else "➡️"
                print(f"  {indicator} {tx_type}: {ratio:.2f}x (anomaly: {anomaly_pct:.1f}% vs normal: {normal_pct:.1f}%)")

    # 4. Save results
    print("\n" + "=" * 70)
    print("SAVING RESULTS")
    print("=" * 70)

    # Save type stats
    with open("tx_type_stats.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["type", "count", "pct", "avg_gas", "max_gas", "total_gas", "avg_cost_eth", "total_cost_eth"])
        writer.writeheader()
        writer.writerows(type_stats)
    print("  Saved tx_type_stats.csv")

    # Save expensive txs
    with open("expensive_transactions.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["rank", "tx_hash", "type", "gas_used", "gas_cost_eth", "block", "timestamp", "anomaly_at_time"])
        writer.writeheader()
        writer.writerows(expensive_txs)
    print("  Saved expensive_transactions.csv")

    # Save all analyzed transactions
    with open("all_analyzed_transactions.csv", "w", newline="") as f:
        fieldnames = ["block_number", "timestamp_iso", "tx_hash", "from", "to", "gas_used", "gas_price_gwei", "gas_cost_eth", "value_eth", "tx_type", "method_id"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_txs)
    print(f"  Saved all_analyzed_transactions.csv ({len(all_txs):,} rows)")

    print("\n✅ Analysis complete!")


if __name__ == "__main__":
    main()
