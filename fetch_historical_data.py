#!/usr/bin/env python3
"""
Fetch historical block data from MegaETH RPC.
Gets data from Jan 22, 2026 to present for comprehensive analysis.
"""

import requests
import json
import time
import csv
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import sys

# VIP RPC endpoint (no rate limits)
RPC_URL = "https://mainnet.megaeth.com/rpc?vip=1&u=DominoGirlV1&v=5184000&s=mafia&verify=1769441404-Z7QuERFgqJPYL%2BIdRrwjch1mx2alQifeOiXH%2FaeQdEc%3D"

# Block range
START_BLOCK = 6_242_989  # Jan 22, 00:00 UTC
# We'll fetch to latest

# Sample every N blocks (1 block = ~1 second, so 100 = every ~100 sec, 600 = every 10 min)
SAMPLE_INTERVAL = 100  # Every ~100 seconds for detailed data

def get_block(block_num):
    """Fetch a single block."""
    payload = {
        "jsonrpc": "2.0",
        "method": "eth_getBlockByNumber",
        "params": [hex(block_num), False],
        "id": block_num
    }
    try:
        resp = requests.post(RPC_URL, json=payload, timeout=10)
        data = resp.json()
        if "result" in data and data["result"]:
            block = data["result"]
            return {
                "block_number": int(block["number"], 16),
                "timestamp": int(block["timestamp"], 16),
                "gas_used": int(block["gasUsed"], 16),
                "gas_limit": int(block["gasLimit"], 16),
                "tx_count": len(block.get("transactions", [])),
                "hash": block["hash"]
            }
    except Exception as e:
        print(f"Error fetching block {block_num}: {e}", file=sys.stderr)
    return None

def get_latest_block():
    """Get the latest block number."""
    payload = {
        "jsonrpc": "2.0",
        "method": "eth_blockNumber",
        "params": [],
        "id": 1
    }
    resp = requests.post(RPC_URL, json=payload, timeout=10)
    data = resp.json()
    return int(data["result"], 16)

def fetch_range(start, end, sample_interval, max_workers=20):
    """Fetch blocks in a range with parallel requests."""
    blocks_to_fetch = list(range(start, end + 1, sample_interval))
    total = len(blocks_to_fetch)
    results = []

    print(f"Fetching {total:,} blocks (every {sample_interval} blocks from {start:,} to {end:,})...")

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(get_block, bn): bn for bn in blocks_to_fetch}
        done = 0
        for future in as_completed(futures):
            done += 1
            result = future.result()
            if result:
                results.append(result)
            if done % 100 == 0 or done == total:
                pct = (done / total) * 100
                print(f"  Progress: {done:,}/{total:,} ({pct:.1f}%)", end="\r")

    print(f"\n  Fetched {len(results):,} blocks successfully")
    return sorted(results, key=lambda x: x["block_number"])

def calculate_metrics(blocks):
    """Calculate derived metrics from block data."""
    metrics = []

    for i, block in enumerate(blocks):
        # Calculate block interval
        if i > 0:
            prev_block = blocks[i-1]
            time_diff = block["timestamp"] - prev_block["timestamp"]
            block_diff = block["block_number"] - prev_block["block_number"]
            if block_diff > 0 and time_diff > 0:
                # Time per block in ms
                block_interval_ms = (time_diff / block_diff) * 1000
            else:
                block_interval_ms = None
        else:
            block_interval_ms = None

        # Gas per second (over the sample interval)
        if i > 0:
            prev_block = blocks[i-1]
            time_diff = block["timestamp"] - prev_block["timestamp"]
            if time_diff > 0:
                # Sum gas from all blocks in interval
                gas_per_second = block["gas_used"] / time_diff / 1_000_000  # MGas/s
            else:
                gas_per_second = None
        else:
            gas_per_second = None

        # TPS estimate (transactions in this block / time since last sample)
        if i > 0:
            prev_block = blocks[i-1]
            time_diff = block["timestamp"] - prev_block["timestamp"]
            if time_diff > 0:
                tps = block["tx_count"] / time_diff
            else:
                tps = None
        else:
            tps = None

        dt = datetime.utcfromtimestamp(block["timestamp"])

        metrics.append({
            "timestamp_iso": dt.isoformat() + "Z",
            "timestamp_unix": block["timestamp"],
            "block_number": block["block_number"],
            "gas_used": block["gas_used"],
            "gas_mgas": round(block["gas_used"] / 1_000_000, 2),
            "tx_count": block["tx_count"],
            "block_interval_ms": round(block_interval_ms, 3) if block_interval_ms else None,
            "gas_per_second_mgas": round(gas_per_second, 2) if gas_per_second else None,
            "tps": round(tps, 2) if tps else None
        })

    return metrics

def detect_anomalies(metrics):
    """Detect anomalies based on standard deviation from mean."""
    import statistics

    # Get valid values for each metric
    gas_values = [m["gas_per_second_mgas"] for m in metrics if m["gas_per_second_mgas"] is not None]
    tps_values = [m["tps"] for m in metrics if m["tps"] is not None]
    interval_values = [m["block_interval_ms"] for m in metrics if m["block_interval_ms"] is not None]

    if len(gas_values) < 10 or len(tps_values) < 10:
        print("Not enough data for anomaly detection")
        return metrics

    # Calculate stats
    gas_mean = statistics.mean(gas_values)
    gas_std = statistics.stdev(gas_values)
    tps_mean = statistics.mean(tps_values)
    tps_std = statistics.stdev(tps_values)
    interval_mean = statistics.mean(interval_values)
    interval_std = statistics.stdev(interval_values)

    print(f"\nStatistics:")
    print(f"  Gas: mean={gas_mean:.1f} MGas/s, std={gas_std:.1f}")
    print(f"  TPS: mean={tps_mean:.1f}, std={tps_std:.1f}")
    print(f"  Block interval: mean={interval_mean:.2f}ms, std={interval_std:.2f}")

    # Mark anomalies
    anomaly_count = 0
    for m in metrics:
        anomalies = []

        if m["gas_per_second_mgas"] is not None:
            if m["gas_per_second_mgas"] < gas_mean - 2*gas_std:
                anomalies.append("GAS_DROP")

        if m["tps"] is not None:
            if m["tps"] < tps_mean - 2*tps_std:
                anomalies.append("TPS_DROP")

        if m["block_interval_ms"] is not None:
            if m["block_interval_ms"] > interval_mean + 2*interval_std:
                anomalies.append("BLOCK_TIME_SPIKE")

        m["anomalies"] = ", ".join(anomalies) if anomalies else ""
        if anomalies:
            anomaly_count += 1

    print(f"  Anomalies detected: {anomaly_count}")

    return metrics

def main():
    print("=" * 60)
    print("MegaETH Historical Data Fetcher")
    print("=" * 60)

    # Get latest block
    latest = get_latest_block()
    print(f"\nLatest block: {latest:,}")
    print(f"Start block: {START_BLOCK:,} (Jan 22, 00:00 UTC)")
    print(f"Total blocks: {latest - START_BLOCK:,}")
    print(f"Sample interval: every {SAMPLE_INTERVAL} blocks")

    # Fetch blocks
    start_time = time.time()
    blocks = fetch_range(START_BLOCK, latest, SAMPLE_INTERVAL)
    elapsed = time.time() - start_time
    print(f"Fetch completed in {elapsed:.1f} seconds")

    if not blocks:
        print("No blocks fetched!")
        return

    # Calculate metrics
    print("\nCalculating metrics...")
    metrics = calculate_metrics(blocks)

    # Detect anomalies
    metrics = detect_anomalies(metrics)

    # Save to CSV
    output_file = "historical_blocks.csv"
    print(f"\nSaving to {output_file}...")

    fieldnames = ["timestamp_iso", "timestamp_unix", "block_number", "gas_used", "gas_mgas",
                  "tx_count", "block_interval_ms", "gas_per_second_mgas", "tps", "anomalies"]

    with open(output_file, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(metrics)

    print(f"Saved {len(metrics):,} rows to {output_file}")

    # Also save anomalies only
    anomaly_file = "historical_anomalies.csv"
    anomalies_only = [m for m in metrics if m["anomalies"]]
    if anomalies_only:
        with open(anomaly_file, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(anomalies_only)
        print(f"Saved {len(anomalies_only):,} anomaly rows to {anomaly_file}")

    # Print summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    first_ts = datetime.utcfromtimestamp(metrics[0]["timestamp_unix"])
    last_ts = datetime.utcfromtimestamp(metrics[-1]["timestamp_unix"])
    print(f"Date range: {first_ts.isoformat()}Z to {last_ts.isoformat()}Z")
    print(f"Total data points: {len(metrics):,}")
    print(f"Anomalies found: {len(anomalies_only):,}")

if __name__ == "__main__":
    main()
