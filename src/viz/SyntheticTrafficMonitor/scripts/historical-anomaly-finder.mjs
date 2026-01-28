#!/usr/bin/env node
/**
 * Historical Anomaly Finder
 *
 * Fetches block data from the last N days and identifies:
 * - Gas spikes (>80% utilization or sudden increases)
 * - Latency anomalies (blocks with unusual timestamps)
 * - TPS drops (>50% decrease)
 * - High failure rates
 *
 * Output: JSON file with anomaly timestamps for replay visualization
 */

import { createWriteStream, writeFileSync, existsSync, mkdirSync } from 'fs';

const RPC_URL = 'https://mainnet.megaeth.com/rpc';
const VIP_RPC_URL = 'https://mainnet.megaeth.com/rpc?vip=1&u=DominoGirlV1&v=5184000&s=mafia&verify=1769441404-Z7QuERFgqJPYL%2BIdRrwjch1mx2alQifeOiXH%2FaeQdEc%3D';

// Output directory
const OUTPUT_DIR = './ralphy-output/historical';
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Anomaly detection thresholds
const THRESHOLDS = {
  gasUtilizationHigh: 0.8,      // 80% gas utilization
  gasUtilizationCritical: 0.9,  // 90% gas utilization
  tpsDropPercent: 0.5,          // 50% TPS drop
  latencySpikeMs: 100,          // 100ms latency spike
  blockTimeAnomalyMs: 50,       // Block time > 50ms (should be ~10ms)
  txCountSpike: 5000,           // Sudden spike in tx count
  gasLimitPerBlock: 2_000_000_000, // 2B gas limit
};

// Known spam contracts
const UNIVERSAL_ROUTER = '0xaab1c664cead881afbb58555e6a3a79523d3e4c0';
const DEX_SWAP_SELECTOR = '0x3593564c'; // execute()
const DUST_AMOUNT = 3n; // 3 wei

// State
const anomalies = [];
const blockData = [];
let lastBlockStats = null;

async function rpcCall(method, params = [], useVip = false) {
  const url = useVip ? VIP_RPC_URL : RPC_URL;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params
    })
  });
  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC Error: ${data.error.message}`);
  }
  return data.result;
}

async function getBlockNumber() {
  const hex = await rpcCall('eth_blockNumber');
  return parseInt(hex, 16);
}

async function getBlock(blockNumberOrHash, includeTxs = true) {
  const param = typeof blockNumberOrHash === 'number'
    ? '0x' + blockNumberOrHash.toString(16)
    : blockNumberOrHash;
  return rpcCall('eth_getBlockByNumber', [param, includeTxs]);
}

function analyzeBlock(block, prevBlock) {
  const blockNumber = parseInt(block.number, 16);
  const timestamp = parseInt(block.timestamp, 16) * 1000;
  const gasUsed = parseInt(block.gasUsed || '0', 16);
  const gasLimit = parseInt(block.gasLimit || '0', 16) || THRESHOLDS.gasLimitPerBlock;
  const txCount = block.transactions?.length || 0;

  const blockStats = {
    blockNumber,
    timestamp,
    gasUsed,
    gasLimit,
    gasUtilization: gasUsed / gasLimit,
    txCount,
    syntheticCount: 0,
    organicCount: 0,
    dexSwapCount: 0,
    dustCount: 0,
    failedCount: 0,
    blockTime: prevBlock ? timestamp - parseInt(prevBlock.timestamp, 16) * 1000 : null,
  };

  // Analyze transactions
  if (block.transactions && Array.isArray(block.transactions)) {
    for (const tx of block.transactions) {
      if (typeof tx === 'string') continue; // Just hash, no details

      const to = (tx.to || '').toLowerCase();
      const input = tx.input || tx.data || '0x';
      let value = 0n;
      try {
        value = BigInt(tx.value || '0x0');
      } catch (e) {
        value = 0n;
      }

      // DEX Swap detection
      if (to === UNIVERSAL_ROUTER || input.startsWith(DEX_SWAP_SELECTOR)) {
        blockStats.syntheticCount++;
        blockStats.dexSwapCount++;
      }
      // Dust transfer detection
      else if (input === '0x' && value === DUST_AMOUNT) {
        blockStats.syntheticCount++;
        blockStats.dustCount++;
      }
      // Organic transaction
      else {
        blockStats.organicCount++;
      }
    }
  }

  return blockStats;
}

function detectAnomalies(blockStats, prevBlockStats) {
  const detected = [];
  const { blockNumber, timestamp, gasUtilization, txCount, blockTime } = blockStats;

  // Gas utilization anomalies
  if (gasUtilization >= THRESHOLDS.gasUtilizationCritical) {
    detected.push({
      type: 'GAS_CRITICAL',
      severity: 'critical',
      message: `Gas utilization at ${(gasUtilization * 100).toFixed(1)}% (CRITICAL)`,
      value: gasUtilization,
      threshold: THRESHOLDS.gasUtilizationCritical
    });
  } else if (gasUtilization >= THRESHOLDS.gasUtilizationHigh) {
    detected.push({
      type: 'GAS_HIGH',
      severity: 'warning',
      message: `Gas utilization at ${(gasUtilization * 100).toFixed(1)}%`,
      value: gasUtilization,
      threshold: THRESHOLDS.gasUtilizationHigh
    });
  }

  // Block time anomalies
  if (blockTime && blockTime > THRESHOLDS.blockTimeAnomalyMs) {
    detected.push({
      type: 'BLOCK_TIME_SPIKE',
      severity: 'warning',
      message: `Block time ${blockTime}ms (should be ~10ms)`,
      value: blockTime,
      threshold: THRESHOLDS.blockTimeAnomalyMs
    });
  }

  // TPS drop detection
  if (prevBlockStats && prevBlockStats.txCount > 0) {
    const tpsDrop = (prevBlockStats.txCount - txCount) / prevBlockStats.txCount;
    if (tpsDrop >= THRESHOLDS.tpsDropPercent) {
      detected.push({
        type: 'TPS_DROP',
        severity: 'critical',
        message: `TPS dropped ${(tpsDrop * 100).toFixed(0)}% (${prevBlockStats.txCount} -> ${txCount})`,
        value: tpsDrop,
        previousTxCount: prevBlockStats.txCount,
        currentTxCount: txCount
      });
    }
  }

  // TX count spike
  if (prevBlockStats && txCount > prevBlockStats.txCount + THRESHOLDS.txCountSpike) {
    detected.push({
      type: 'TX_SPIKE',
      severity: 'info',
      message: `TX count spiked from ${prevBlockStats.txCount} to ${txCount}`,
      value: txCount - prevBlockStats.txCount
    });
  }

  return detected;
}

async function fetchHistoricalBlocks(startBlock, endBlock, sampleInterval = 100) {
  console.log(`\n📊 Fetching blocks ${startBlock} to ${endBlock} (sampling every ${sampleInterval} blocks)\n`);

  const totalBlocks = Math.floor((endBlock - startBlock) / sampleInterval);
  let processed = 0;
  let prevBlock = null;
  let prevBlockStats = null;

  for (let blockNum = startBlock; blockNum <= endBlock; blockNum += sampleInterval) {
    try {
      const block = await getBlock(blockNum, true);
      if (!block) {
        console.log(`  Block ${blockNum} not found, skipping...`);
        continue;
      }

      const blockStats = analyzeBlock(block, prevBlock);
      const detectedAnomalies = detectAnomalies(blockStats, prevBlockStats);

      // Store block data
      blockData.push(blockStats);

      // Store anomalies with context
      if (detectedAnomalies.length > 0) {
        anomalies.push({
          blockNumber: blockStats.blockNumber,
          timestamp: blockStats.timestamp,
          isoTime: new Date(blockStats.timestamp).toISOString(),
          anomalies: detectedAnomalies,
          blockStats
        });

        // Log significant anomalies
        for (const anomaly of detectedAnomalies) {
          const icon = anomaly.severity === 'critical' ? '🚨' : anomaly.severity === 'warning' ? '⚠️' : 'ℹ️';
          console.log(`  ${icon} Block ${blockStats.blockNumber}: ${anomaly.message}`);
        }
      }

      prevBlock = block;
      prevBlockStats = blockStats;
      processed++;

      // Progress update
      if (processed % 50 === 0) {
        const pct = ((processed / totalBlocks) * 100).toFixed(1);
        console.log(`  Progress: ${processed}/${totalBlocks} blocks (${pct}%)`);
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 50));

    } catch (err) {
      console.error(`  Error fetching block ${blockNum}:`, err.message);
    }
  }

  return { blockData, anomalies };
}

function generateReport(anomalies, blockData) {
  // Group anomalies by type
  const byType = {};
  for (const a of anomalies) {
    for (const anomaly of a.anomalies) {
      if (!byType[anomaly.type]) {
        byType[anomaly.type] = [];
      }
      byType[anomaly.type].push({
        blockNumber: a.blockNumber,
        timestamp: a.timestamp,
        isoTime: a.isoTime,
        ...anomaly
      });
    }
  }

  // Find worst gas spikes
  const gasSpikes = [...(byType.GAS_CRITICAL || []), ...(byType.GAS_HIGH || [])]
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);

  // Find TPS drops
  const tpsDrops = (byType.TPS_DROP || [])
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);

  // Find block time anomalies
  const blockTimeSpikes = (byType.BLOCK_TIME_SPIKE || [])
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);

  // Calculate statistics
  const stats = {
    totalBlocksAnalyzed: blockData.length,
    totalAnomalies: anomalies.length,
    anomaliesByType: Object.fromEntries(
      Object.entries(byType).map(([k, v]) => [k, v.length])
    ),
    avgGasUtilization: blockData.reduce((sum, b) => sum + b.gasUtilization, 0) / blockData.length,
    maxGasUtilization: Math.max(...blockData.map(b => b.gasUtilization)),
    avgTxPerBlock: blockData.reduce((sum, b) => sum + b.txCount, 0) / blockData.length,
    syntheticPct: blockData.reduce((sum, b) => sum + b.syntheticCount, 0) /
                  blockData.reduce((sum, b) => sum + b.txCount, 0) * 100,
  };

  return {
    generatedAt: new Date().toISOString(),
    stats,
    worstGasSpikes: gasSpikes,
    worstTpsDrops: tpsDrops,
    worstBlockTimeSpikes: blockTimeSpikes,
    allAnomalies: anomalies,
    blockData: blockData.slice(-1000), // Last 1000 blocks for replay
  };
}

async function main() {
  console.log('🔍 Historical Anomaly Finder');
  console.log('============================\n');

  // Get current block
  const currentBlock = await getBlockNumber();
  console.log(`Current block: ${currentBlock}`);

  // Calculate block range for last 4 days
  // MegaETH has ~10ms blocks = 100 blocks/sec = 8,640,000 blocks/day
  const BLOCKS_PER_DAY = 8_640_000;
  const DAYS_TO_FETCH = 4;
  const startBlock = currentBlock - (BLOCKS_PER_DAY * DAYS_TO_FETCH);

  console.log(`Analyzing from block ${startBlock} to ${currentBlock}`);
  console.log(`Time range: ~${DAYS_TO_FETCH} days`);

  // Sample every 10000 blocks (~100 seconds intervals) to avoid overwhelming the RPC
  const SAMPLE_INTERVAL = 10000;

  const { blockData, anomalies } = await fetchHistoricalBlocks(startBlock, currentBlock, SAMPLE_INTERVAL);

  console.log(`\n📊 Analysis Complete`);
  console.log(`   Blocks analyzed: ${blockData.length}`);
  console.log(`   Anomalies found: ${anomalies.length}`);

  // Generate report
  const report = generateReport(anomalies, blockData);

  // Save results
  const outputPath = `${OUTPUT_DIR}/anomaly-report-${Date.now()}.json`;
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ Report saved to: ${outputPath}`);

  // Print summary
  console.log('\n📋 SUMMARY');
  console.log('==========');
  console.log(`Total anomalies: ${report.stats.totalAnomalies}`);
  console.log(`Anomalies by type:`);
  for (const [type, count] of Object.entries(report.stats.anomaliesByType)) {
    console.log(`  - ${type}: ${count}`);
  }

  if (report.worstGasSpikes.length > 0) {
    console.log('\n🔥 Top Gas Spikes (for replay):');
    for (const spike of report.worstGasSpikes.slice(0, 5)) {
      console.log(`  Block ${spike.blockNumber} @ ${spike.isoTime}: ${(spike.value * 100).toFixed(1)}% utilization`);
    }
  }

  if (report.worstTpsDrops.length > 0) {
    console.log('\n📉 Top TPS Drops (for replay):');
    for (const drop of report.worstTpsDrops.slice(0, 5)) {
      console.log(`  Block ${drop.blockNumber} @ ${drop.isoTime}: ${(drop.value * 100).toFixed(0)}% drop`);
    }
  }

  console.log('\n💡 Use these timestamps for replay visualization in the dashboard.');
}

main().catch(console.error);
