#!/usr/bin/env node
/**
 * Fast Anomaly Finder
 *
 * Fetches historical data from MegaETH Dashboard WebSocket API
 * and identifies gas spikes, latency spikes, and TPS drops.
 *
 * Usage: node fast-anomaly-finder.mjs
 */

import WebSocket from 'ws';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

const WS_URL = 'wss://mainnet-dashboard.megaeth.com/metrics';
const OUTPUT_DIR = './ralphy-output/historical';

if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Anomaly detection thresholds
const THRESHOLDS = {
  // Gas per second anomalies (in MGas/s)
  gasSpikeMGas: 500,      // Alert when gas/s > 500 MGas
  gasCriticalMGas: 800,   // Critical when > 800 MGas

  // TPS anomalies (in K TPS)
  tpsDropPercent: 30,     // 30% drop is significant
  tpsSpike: 25,           // TPS spike > 25K

  // Block interval anomalies (in ms)
  blockIntervalHigh: 20,  // Should be ~10ms, alert if > 20ms
  blockIntervalCritical: 50, // Critical if > 50ms
};

let historicalData = null;

async function fetchDashboardData() {
  return new Promise((resolve, reject) => {
    console.log('🔌 Connecting to MegaETH Dashboard WebSocket...');

    const ws = new WebSocket(WS_URL);
    let timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket timeout'));
    }, 30000);

    ws.on('open', () => {
      console.log('✅ Connected! Waiting for historical data...');
    });

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());

        // Check if this has historical data
        if (parsed.historical_tps_7d || parsed.data?.historical_tps_7d) {
          const histData = parsed.data || parsed;
          console.log('📊 Received historical data!');
          console.log(`   - TPS 7d: ${histData.historical_tps_7d?.length || 0} points`);
          console.log(`   - Gas 7d: ${histData.historical_gas_per_second_7d?.length || 0} points`);
          console.log(`   - Block interval 7d: ${histData.historical_mini_block_interval_7d?.length || 0} points`);

          clearTimeout(timeout);
          ws.close();
          resolve(histData);
        }
      } catch (err) {
        console.error('Parse error:', err.message);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on('close', () => {
      console.log('🔌 WebSocket closed');
    });
  });
}

function findAnomalies(data) {
  const anomalies = {
    gasSpikes: [],
    tpsDrops: [],
    blockTimeSpikes: [],
    summary: {}
  };

  // Analyze 7-day gas data
  const gas7d = data.historical_gas_per_second_7d || [];
  console.log(`\n🔥 Analyzing ${gas7d.length} gas data points...`);

  let maxGas = 0;
  let minGas = Infinity;

  for (let i = 0; i < gas7d.length; i++) {
    const point = gas7d[i];
    const gasValue = point.value / 1_000_000; // Convert to MGas

    if (gasValue > maxGas) maxGas = gasValue;
    if (gasValue < minGas) minGas = gasValue;

    if (gasValue >= THRESHOLDS.gasCriticalMGas) {
      anomalies.gasSpikes.push({
        timestamp: point.timestamp * 1000,
        isoTime: new Date(point.timestamp * 1000).toISOString(),
        value: gasValue,
        severity: 'critical',
        message: `Gas spike: ${gasValue.toFixed(1)} MGas/s (CRITICAL)`
      });
    } else if (gasValue >= THRESHOLDS.gasSpikeMGas) {
      anomalies.gasSpikes.push({
        timestamp: point.timestamp * 1000,
        isoTime: new Date(point.timestamp * 1000).toISOString(),
        value: gasValue,
        severity: 'warning',
        message: `Gas spike: ${gasValue.toFixed(1)} MGas/s`
      });
    }
  }

  console.log(`   Max Gas: ${maxGas.toFixed(1)} MGas/s`);
  console.log(`   Min Gas: ${minGas.toFixed(1)} MGas/s`);
  console.log(`   Gas spikes found: ${anomalies.gasSpikes.length}`);

  // Analyze 7-day TPS data
  const tps7d = data.historical_tps_7d || [];
  console.log(`\n📈 Analyzing ${tps7d.length} TPS data points...`);

  let maxTps = 0;
  let minTps = Infinity;
  let prevTps = null;

  for (let i = 0; i < tps7d.length; i++) {
    const point = tps7d[i];
    const tpsValue = point.value; // Already in K TPS

    if (tpsValue > maxTps) maxTps = tpsValue;
    if (tpsValue < minTps) minTps = tpsValue;

    // Detect drops
    if (prevTps !== null && prevTps > 5) { // Only check if previous was meaningful
      const dropPct = ((prevTps - tpsValue) / prevTps) * 100;
      if (dropPct >= THRESHOLDS.tpsDropPercent) {
        anomalies.tpsDrops.push({
          timestamp: point.timestamp * 1000,
          isoTime: new Date(point.timestamp * 1000).toISOString(),
          value: dropPct,
          fromTps: prevTps,
          toTps: tpsValue,
          severity: dropPct >= 50 ? 'critical' : 'warning',
          message: `TPS dropped ${dropPct.toFixed(0)}%: ${prevTps.toFixed(1)}K → ${tpsValue.toFixed(1)}K`
        });
      }
    }

    prevTps = tpsValue;
  }

  console.log(`   Max TPS: ${maxTps.toFixed(1)}K`);
  console.log(`   Min TPS: ${minTps.toFixed(1)}K`);
  console.log(`   TPS drops found: ${anomalies.tpsDrops.length}`);

  // Analyze block interval data
  const interval7d = data.historical_mini_block_interval_7d || [];
  console.log(`\n⏱️  Analyzing ${interval7d.length} block interval points...`);

  let maxInterval = 0;
  let minInterval = Infinity;

  for (let i = 0; i < interval7d.length; i++) {
    const point = interval7d[i];
    const intervalMs = point.value; // In ms

    if (intervalMs > maxInterval) maxInterval = intervalMs;
    if (intervalMs < minInterval) minInterval = intervalMs;

    if (intervalMs >= THRESHOLDS.blockIntervalCritical) {
      anomalies.blockTimeSpikes.push({
        timestamp: point.timestamp * 1000,
        isoTime: new Date(point.timestamp * 1000).toISOString(),
        value: intervalMs,
        severity: 'critical',
        message: `Block interval spike: ${intervalMs.toFixed(1)}ms (should be ~10ms)`
      });
    } else if (intervalMs >= THRESHOLDS.blockIntervalHigh) {
      anomalies.blockTimeSpikes.push({
        timestamp: point.timestamp * 1000,
        isoTime: new Date(point.timestamp * 1000).toISOString(),
        value: intervalMs,
        severity: 'warning',
        message: `Block interval high: ${intervalMs.toFixed(1)}ms`
      });
    }
  }

  console.log(`   Max interval: ${maxInterval.toFixed(1)}ms`);
  console.log(`   Min interval: ${minInterval.toFixed(1)}ms`);
  console.log(`   Block time spikes found: ${anomalies.blockTimeSpikes.length}`);

  // Summary
  anomalies.summary = {
    totalAnomalies: anomalies.gasSpikes.length + anomalies.tpsDrops.length + anomalies.blockTimeSpikes.length,
    gasSpikes: anomalies.gasSpikes.length,
    tpsDrops: anomalies.tpsDrops.length,
    blockTimeSpikes: anomalies.blockTimeSpikes.length,
    maxGasMGas: maxGas,
    minGasMGas: minGas,
    maxTpsK: maxTps,
    minTpsK: minTps,
    maxBlockIntervalMs: maxInterval,
    minBlockIntervalMs: minInterval,
    dataPoints: {
      gas7d: gas7d.length,
      tps7d: tps7d.length,
      interval7d: interval7d.length
    }
  };

  return anomalies;
}

function generateReplayTimestamps(anomalies) {
  // Get top 10 most interesting timestamps for replay
  const allAnomalies = [
    ...anomalies.gasSpikes.map(a => ({ ...a, type: 'gas' })),
    ...anomalies.tpsDrops.map(a => ({ ...a, type: 'tps' })),
    ...anomalies.blockTimeSpikes.map(a => ({ ...a, type: 'blockTime' }))
  ].sort((a, b) => {
    // Sort by severity (critical first), then by value
    if (a.severity !== b.severity) {
      return a.severity === 'critical' ? -1 : 1;
    }
    return b.value - a.value;
  });

  return allAnomalies.slice(0, 20).map(a => ({
    timestamp: a.timestamp,
    isoTime: a.isoTime,
    type: a.type,
    severity: a.severity,
    message: a.message,
    value: a.value
  }));
}

async function main() {
  console.log('🔍 Fast Anomaly Finder');
  console.log('======================\n');

  try {
    // Fetch data from dashboard
    const data = await fetchDashboardData();

    // Save raw data
    const rawDataPath = `${OUTPUT_DIR}/dashboard-data-${Date.now()}.json`;
    writeFileSync(rawDataPath, JSON.stringify({ data }, null, 2));
    console.log(`\n💾 Raw data saved to: ${rawDataPath}`);

    // Find anomalies
    const anomalies = findAnomalies(data);

    // Generate replay timestamps
    const replayTimestamps = generateReplayTimestamps(anomalies);

    // Create final report
    const report = {
      generatedAt: new Date().toISOString(),
      summary: anomalies.summary,
      replayTimestamps,
      gasSpikes: anomalies.gasSpikes.sort((a, b) => b.value - a.value).slice(0, 50),
      tpsDrops: anomalies.tpsDrops.sort((a, b) => b.value - a.value).slice(0, 50),
      blockTimeSpikes: anomalies.blockTimeSpikes.sort((a, b) => b.value - a.value).slice(0, 50),
      rawHistoricalData: {
        gas7d: data.historical_gas_per_second_7d,
        tps7d: data.historical_tps_7d,
        interval7d: data.historical_mini_block_interval_7d
      }
    };

    // Save report
    const reportPath = `${OUTPUT_DIR}/anomaly-report.json`;
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n✅ Report saved to: ${reportPath}`);

    // Print replay timestamps
    console.log('\n🎬 TOP TIMESTAMPS FOR REPLAY:');
    console.log('==============================');
    for (const ts of replayTimestamps) {
      const icon = ts.type === 'gas' ? '🔥' : ts.type === 'tps' ? '📉' : '⏱️';
      console.log(`${icon} ${ts.isoTime} - ${ts.message}`);
    }

    console.log('\n💡 Use these timestamps in the dashboard replay feature.');
    console.log('   Load the anomaly-report.json file and select a timestamp to replay.');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
