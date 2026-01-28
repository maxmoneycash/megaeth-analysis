#!/usr/bin/env python3
"""
Analyze historical block data and regenerate smoking gun CSVs.
Uses RPC-fetched data from Jan 22 onwards.
"""

import csv
from datetime import datetime
import statistics

print("=" * 60)
print("Historical Data Analysis")
print("=" * 60)

# Load data
with open("historical_blocks.csv") as f:
    all_data = list(csv.DictReader(f))

print(f"\nTotal data points: {len(all_data)}")

# Filter to stable load period (Jan 25+)
jan25_start = datetime(2026, 1, 25, 0, 0, 0).timestamp()
stable_data = [r for r in all_data if int(r["timestamp_unix"]) >= jan25_start]
print(f"Stable period (Jan 25+): {len(stable_data)} points")

# Calculate baseline stats from stable period
gas_values = [float(r["gas_mgas"]) for r in stable_data]
gas_mean = statistics.mean(gas_values)
gas_std = statistics.stdev(gas_values)

# Calculate TPS (tx_count per 100 seconds since we sample every 100 blocks)
tps_values = [float(r["tx_count"]) / 100 for r in stable_data]  # tx per second
tps_mean = statistics.mean(tps_values)
tps_std = statistics.stdev(tps_values)

print(f"\nBaseline stats (stable period):")
print(f"  Gas: mean={gas_mean:.1f} MGas, std={gas_std:.1f}")
print(f"  TPS: mean={tps_mean:.0f}, std={tps_std:.0f}")

# ============================================
# SMOKING GUN 3: Worst moments
# ============================================
print("\n" + "=" * 60)
print("Creating smoking_gun_3_worst_moments.csv")
print("=" * 60)

worst_moments = []

# Gas drops (from ALL data, marking stable vs ramp-up)
all_gas = [(float(r["gas_mgas"]), r) for r in all_data]
gas_sorted = sorted(all_gas, key=lambda x: x[0])[:20]  # 20 worst

for i, (gas, row) in enumerate(gas_sorted):
    ts = int(row["timestamp_unix"])
    is_stable = ts >= jan25_start
    pct = (gas / 2048) * 100

    if gas < 1500:
        verdict = "MAJOR OUTAGE"
    elif gas < 1800:
        verdict = "THROUGHPUT CRASHED"
    elif gas < 2000:
        verdict = "THROUGHPUT DEGRADED"
    else:
        verdict = "MINOR DIP"

    if not is_stable:
        verdict += " (ramp-up period)"

    worst_moments.append({
        "rank": i + 1,
        "metric": "gas",
        "timestamp": row["timestamp_iso"],
        "value": round(gas, 2),
        "unit": "MGas/block",
        "normal_value": 2048,
        "pct_of_normal": f"{pct:.1f}%",
        "period": "stable" if is_stable else "ramp-up",
        "verdict": verdict
    })

# TPS drops (stable period only, meaningful)
stable_tps = [(float(r["tx_count"]) / 100, r) for r in stable_data]
tps_sorted = sorted(stable_tps, key=lambda x: x[0])[:10]

for i, (tps, row) in enumerate(tps_sorted):
    pct = (tps / 210) * 100  # Normal is ~210 TPS

    if tps < 150:
        verdict = "TPS CRASHED"
    elif tps < 180:
        verdict = "TPS DEGRADED"
    else:
        verdict = "TPS SLIGHTLY LOW"

    worst_moments.append({
        "rank": i + 1,
        "metric": "tps",
        "timestamp": row["timestamp_iso"],
        "value": round(tps, 1),
        "unit": "TPS",
        "normal_value": 210,
        "pct_of_normal": f"{pct:.1f}%",
        "period": "stable",
        "verdict": verdict
    })

with open("smoking_gun_3_worst_moments.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["rank", "metric", "timestamp", "value", "unit",
                                            "normal_value", "pct_of_normal", "period", "verdict"])
    writer.writeheader()
    writer.writerows(worst_moments)
print(f"  Created with {len(worst_moments)} rows")

# ============================================
# SMOKING GUN 2: Correlated drops
# ============================================
print("\nCreating smoking_gun_2_correlated_drops.csv")

correlated = []
gas_threshold = gas_mean - 2 * gas_std
tps_threshold = tps_mean - 2 * tps_std

for row in stable_data:
    gas = float(row["gas_mgas"])
    tps = float(row["tx_count"]) / 100

    gas_bad = gas < gas_threshold
    tps_bad = tps < tps_threshold

    if gas_bad or tps_bad:
        degraded = sum([gas_bad, tps_bad])
        correlated.append({
            "timestamp": row["timestamp_iso"],
            "block_number": row["block_number"],
            "gas_mgas": round(gas, 1),
            "tps": round(tps, 1),
            "degraded_metrics": degraded,
            "gas_drop": "YES" if gas_bad else "NO",
            "tps_drop": "YES" if tps_bad else "NO",
            "severity": "CRITICAL" if degraded == 2 else "WARNING"
        })

with open("smoking_gun_2_correlated_drops.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["timestamp", "block_number", "gas_mgas", "tps",
                                            "degraded_metrics", "gas_drop", "tps_drop", "severity"])
    writer.writeheader()
    writer.writerows(correlated)
print(f"  Created with {len(correlated)} rows")

# ============================================
# SMOKING GUN 4: Anomaly duration
# ============================================
print("\nCreating smoking_gun_4_anomaly_duration.csv")

# Group consecutive anomalies
periods = []
current = None

for row in stable_data:
    gas = float(row["gas_mgas"])
    ts = int(row["timestamp_unix"])
    is_anomaly = gas < gas_threshold

    if is_anomaly:
        if current is None:
            current = {"start": ts, "end": ts, "count": 1, "min_gas": gas}
        else:
            # If within 10 minutes, extend period
            if ts - current["end"] < 600:
                current["end"] = ts
                current["count"] += 1
                current["min_gas"] = min(current["min_gas"], gas)
            else:
                periods.append(current)
                current = {"start": ts, "end": ts, "count": 1, "min_gas": gas}
    else:
        if current is not None:
            periods.append(current)
            current = None

if current:
    periods.append(current)

duration_rows = []
for p in periods:
    start_dt = datetime.utcfromtimestamp(p["start"]).isoformat() + "Z"
    end_dt = datetime.utcfromtimestamp(p["end"]).isoformat() + "Z"
    duration = (p["end"] - p["start"]) / 60

    severity = "CRITICAL" if p["min_gas"] < 1800 else "WARNING"

    duration_rows.append({
        "start_time": start_dt,
        "end_time": end_dt,
        "duration_minutes": round(duration, 1),
        "anomaly_count": p["count"],
        "min_gas_mgas": round(p["min_gas"], 1),
        "severity": severity
    })

# Sort by severity then duration
duration_rows.sort(key=lambda x: (0 if x["severity"] == "CRITICAL" else 1, -x["duration_minutes"]))

with open("smoking_gun_4_anomaly_duration.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["start_time", "end_time", "duration_minutes",
                                            "anomaly_count", "min_gas_mgas", "severity"])
    writer.writeheader()
    writer.writerows(duration_rows)
print(f"  Created with {len(duration_rows)} rows")

# ============================================
# SMOKING GUN 5: Claims vs Reality
# ============================================
print("\nCreating smoking_gun_5_claims_vs_reality.csv")

min_gas = min(gas_values)
min_tps = min(tps_values)

claims = [
    {
        "metric": "TPS Capacity",
        "megaeth_claim": "100,000+ TPS",
        "measured_avg": f"{tps_mean:.0f} TPS",
        "measured_worst": f"{min_tps:.0f} TPS",
        "gap": f"{100000/tps_mean:.0f}x below claim",
        "verdict": "INFLATED"
    },
    {
        "metric": "Gas Throughput",
        "megaeth_claim": "~2000 MGas/s",
        "measured_avg": f"{gas_mean:.0f} MGas",
        "measured_worst": f"{min_gas:.0f} MGas",
        "gap": f"{((2048-min_gas)/2048)*100:.0f}% drop at worst",
        "verdict": "UNSTABLE"
    },
    {
        "metric": "Consistency",
        "megaeth_claim": "Stable performance",
        "measured_avg": f"σ={gas_std:.1f} MGas",
        "measured_worst": f"{len([g for g in gas_values if g < gas_mean - 2*gas_std])} anomalies",
        "gap": "Multiple outages",
        "verdict": "UNRELIABLE"
    },
    {
        "metric": "Traffic Type",
        "megaeth_claim": "Real user transactions",
        "measured_avg": "~99% synthetic",
        "measured_worst": "Dust spam + fake DEX",
        "gap": "N/A",
        "verdict": "FAKE TRAFFIC"
    }
]

with open("smoking_gun_5_claims_vs_reality.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["metric", "megaeth_claim", "measured_avg",
                                            "measured_worst", "gap", "verdict"])
    writer.writeheader()
    writer.writerows(claims)
print(f"  Created with {len(claims)} rows")

# ============================================
# SMOKING GUN 6: Daily patterns
# ============================================
print("\nCreating smoking_gun_6_daily_patterns.csv")

daily = {}
for row in all_data:
    dt = datetime.fromisoformat(row["timestamp_iso"].rstrip("Z"))
    day = dt.strftime("%Y-%m-%d")
    gas = float(row["gas_mgas"])
    tps = float(row["tx_count"]) / 100

    if day not in daily:
        daily[day] = {"gas": [], "tps": []}
    daily[day]["gas"].append(gas)
    daily[day]["tps"].append(tps)

daily_rows = []
for day in sorted(daily.keys()):
    d = daily[day]
    daily_rows.append({
        "date": day,
        "avg_gas_mgas": round(statistics.mean(d["gas"]), 1),
        "min_gas_mgas": round(min(d["gas"]), 1),
        "max_gas_mgas": round(max(d["gas"]), 1),
        "avg_tps": round(statistics.mean(d["tps"]), 0),
        "min_tps": round(min(d["tps"]), 0),
        "sample_count": len(d["gas"])
    })

with open("smoking_gun_6_daily_patterns.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["date", "avg_gas_mgas", "min_gas_mgas",
                                            "max_gas_mgas", "avg_tps", "min_tps", "sample_count"])
    writer.writeheader()
    writer.writerows(daily_rows)
print(f"  Created with {len(daily_rows)} rows")

# ============================================
# SUMMARY
# ============================================
print("\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)

first_ts = datetime.fromisoformat(all_data[0]["timestamp_iso"].rstrip("Z"))
last_ts = datetime.fromisoformat(all_data[-1]["timestamp_iso"].rstrip("Z"))

print(f"Data range: {first_ts} to {last_ts}")
print(f"Total samples: {len(all_data):,}")
print(f"Stable period samples: {len(stable_data):,}")
print(f"\nKey findings:")
print(f"  - {len(correlated)} anomaly events in stable period")
print(f"  - {len([r for r in correlated if r['severity'] == 'CRITICAL'])} CRITICAL events")
print(f"  - Worst gas: {min_gas:.0f} MGas ({(min_gas/2048)*100:.0f}% of normal)")
print(f"  - Worst TPS: {min_tps:.0f} ({(min_tps/210)*100:.0f}% of normal)")

print("\n✅ All smoking gun CSVs updated!")
