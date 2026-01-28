#!/usr/bin/env node
/**
 * MegaETH Latency Analyzer
 *
 * Analyzes REAL user-experienced latency from GameMoves contract.
 * The contract stores clientTimestamp (when user made move) and
 * blockTimestamp (when it hit the chain) - giving us TRUE latency!
 *
 * DISCOVERY: MegaETH claims 55ms latency but actual is 1-37+ seconds!
 *
 * Usage:
 *   node latency-analyzer.mjs                    # Analyze current blocks
 *   node latency-analyzer.mjs --continuous       # Continuous monitoring
 *   node latency-analyzer.mjs --blocks=100       # Analyze last 100 blocks
 */

import { createPublicClient, http, decodeAbiParameters } from 'viem';
import { writeFileSync, existsSync, readFileSync } from 'fs';

// =============================================================================
// CONFIGURATION
// =============================================================================
const CONFIG = {
  rpc: 'https://mainnet.megaeth.com/rpc',
  chainId: 4326,

  // GameMoves contract - stores player moves with timestamps
  gameMoves: '0xa30a04b433999d1b20e528429ca31749c7a59098',

  // Function selectors
  storeMove: '0x1628d7b8', // storeMove(address, uint256, Direction, uint40)

  // Output
  outputFile: './latency-data.json',
};

// =============================================================================
// VIEM CLIENT
// =============================================================================
const megaeth = {
  id: CONFIG.chainId,
  name: 'MegaETH',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [CONFIG.rpc] } },
};

const client = createPublicClient({
  chain: megaeth,
  transport: http(CONFIG.rpc),
});

// =============================================================================
// LATENCY EXTRACTION
// =============================================================================
function parseStoreMoveInput(input) {
  if (!input.startsWith(CONFIG.storeMove) || input.length < 266) {
    return null;
  }

  const params = input.slice(10); // Remove function selector

  // storeMove(address player, uint256 nftId, Direction direction, uint40 clientTimestamp)
  const player = '0x' + params.slice(24, 64);
  const nftId = BigInt('0x' + params.slice(64, 128));
  const direction = parseInt(params.slice(128, 192), 16);
  const clientTimestamp = parseInt(params.slice(192, 256), 16);

  const directions = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

  return {
    player,
    nftId: Number(nftId),
    direction: directions[direction] || 'UNKNOWN',
    clientTimestamp,
  };
}

async function analyzeBlock(blockNumber) {
  const block = await client.getBlock({
    blockNumber: BigInt(blockNumber),
    includeTransactions: true,
  });

  const blockTimestamp = Number(block.timestamp);
  const latencies = [];

  for (const tx of block.transactions) {
    if (tx.to?.toLowerCase() !== CONFIG.gameMoves.toLowerCase()) continue;

    const parsed = parseStoreMoveInput(tx.input);
    if (!parsed || parsed.clientTimestamp === 0) continue;

    const latency = blockTimestamp - parsed.clientTimestamp;

    // Sanity check - latency should be positive and reasonable
    if (latency > 0 && latency < 300) {
      latencies.push({
        txHash: tx.hash,
        player: parsed.player,
        direction: parsed.direction,
        clientTimestamp: parsed.clientTimestamp,
        blockTimestamp,
        latencySeconds: latency,
        latencyMs: latency * 1000,
      });
    }
  }

  return {
    blockNumber,
    blockTimestamp,
    gameMovesTxs: latencies.length,
    latencies,
  };
}

// =============================================================================
// STATISTICS
// =============================================================================
function calculateStats(latencies) {
  if (latencies.length === 0) return null;

  const values = latencies.map(l => l.latencySeconds);
  const sorted = [...values].sort((a, b) => a - b);

  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;

  const p50Index = Math.floor(values.length * 0.50);
  const p95Index = Math.floor(values.length * 0.95);
  const p99Index = Math.floor(values.length * 0.99);

  // Distribution buckets
  const distribution = {};
  for (let i = 0; i <= 60; i++) {
    distribution[i] = values.filter(v => Math.floor(v) === i).length;
  }

  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: avg,
    p50: sorted[p50Index] || 0,
    p95: sorted[p95Index] || 0,
    p99: sorted[p99Index] || 0,
    distribution,
  };
}

function printStats(stats, label = 'Latency Statistics') {
  console.log(`\n${label}`);
  console.log('═'.repeat(50));
  console.log(`Samples: ${stats.count}`);
  console.log(`Min:     ${stats.min}s (${stats.min * 1000}ms)`);
  console.log(`Max:     ${stats.max}s (${stats.max * 1000}ms)`);
  console.log(`Average: ${stats.avg.toFixed(1)}s (${(stats.avg * 1000).toFixed(0)}ms)`);
  console.log(`p50:     ${stats.p50}s (${stats.p50 * 1000}ms)`);
  console.log(`p95:     ${stats.p95}s (${stats.p95 * 1000}ms)`);
  console.log(`p99:     ${stats.p99}s (${stats.p99 * 1000}ms)`);

  console.log('\nDistribution (first 15 seconds):');
  for (let i = 0; i <= 15; i++) {
    const count = stats.distribution[i] || 0;
    const bar = '█'.repeat(Math.min(count, 50));
    if (count > 0) {
      console.log(`  ${i.toString().padStart(2)}s: ${bar} (${count})`);
    }
  }

  // MegaETH comparison
  console.log('\n' + '─'.repeat(50));
  console.log('🚨 COMPARISON WITH MEGAETH CLAIMS:');
  console.log('─'.repeat(50));
  console.log(`MegaETH claims:     55ms E2E latency`);
  console.log(`Actual average:     ${(stats.avg * 1000).toFixed(0)}ms`);
  console.log(`Ratio:              ${(stats.avg * 1000 / 55).toFixed(0)}x WORSE`);
  console.log(`Actual p95:         ${(stats.p95 * 1000).toFixed(0)}ms`);
  console.log(`p95 ratio:          ${(stats.p95 * 1000 / 55).toFixed(0)}x WORSE`);
}

// =============================================================================
// MAIN ANALYSIS
// =============================================================================
async function analyzeRecentBlocks(numBlocks = 20) {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     MegaETH Latency Analyzer - GameMoves Analysis          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nAnalyzing ${numBlocks} blocks for REAL user latency...`);
  console.log(`Contract: ${CONFIG.gameMoves} (GameMoves)`);
  console.log(`This contract stores clientTimestamp vs blockTimestamp!\n`);

  const currentBlock = await client.getBlockNumber();
  const allLatencies = [];
  let blocksWithData = 0;

  for (let i = 0; i < numBlocks; i++) {
    const blockNum = Number(currentBlock) - i;
    process.stdout.write(`\rAnalyzing block ${blockNum} (${i + 1}/${numBlocks})...`);

    try {
      const result = await analyzeBlock(blockNum);
      if (result.latencies.length > 0) {
        allLatencies.push(...result.latencies);
        blocksWithData++;
      }
    } catch (e) {
      // Skip failed blocks
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n\nBlocks with GameMoves txs: ${blocksWithData}/${numBlocks}`);
  console.log(`Total latency samples: ${allLatencies.length}`);

  if (allLatencies.length === 0) {
    console.log('\n⚠️  No GameMoves transactions found. Games might not be active.');
    return;
  }

  const stats = calculateStats(allLatencies);
  printStats(stats);

  // Save data
  const output = {
    timestamp: new Date().toISOString(),
    blocksAnalyzed: numBlocks,
    blocksWithData,
    samples: allLatencies.length,
    stats,
    rawData: allLatencies.slice(0, 100), // Save first 100 samples
    megaethClaimed: {
      latencyMs: 55,
      blockTimeMs: 10,
    },
    findings: {
      actualAvgLatencyMs: stats.avg * 1000,
      actualP95LatencyMs: stats.p95 * 1000,
      ratioVsClaimed: (stats.avg * 1000 / 55).toFixed(0) + 'x',
      verdict: stats.avg > 1 ? 'LATENCY SIGNIFICANTLY WORSE THAN CLAIMED' : 'LATENCY ACCEPTABLE',
    },
  };

  writeFileSync(CONFIG.outputFile, JSON.stringify(output, null, 2));
  console.log(`\n💾 Data saved to ${CONFIG.outputFile}`);

  return output;
}

async function continuousMonitor() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     MegaETH Latency Monitor - Continuous Mode              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\nMonitoring for latency anomalies... Press Ctrl+C to stop.\n');

  const allLatencies = [];
  let lastBlock = 0;

  while (true) {
    try {
      const currentBlock = await client.getBlockNumber();

      if (Number(currentBlock) > lastBlock) {
        const result = await analyzeBlock(Number(currentBlock));
        lastBlock = Number(currentBlock);

        if (result.latencies.length > 0) {
          allLatencies.push(...result.latencies);

          for (const l of result.latencies) {
            const emoji = l.latencySeconds > 5 ? '🔴' : l.latencySeconds > 2 ? '🟡' : '🟢';
            console.log(`${emoji} Block ${result.blockNumber} | ${l.direction.padEnd(5)} | Latency: ${l.latencySeconds}s | Player: ${l.player.slice(0, 12)}...`);
          }

          // Show running stats every 10 samples
          if (allLatencies.length % 10 === 0) {
            const stats = calculateStats(allLatencies);
            console.log(`\n📊 Running avg: ${stats.avg.toFixed(1)}s | p95: ${stats.p95}s | samples: ${stats.count}\n`);
          }
        }
      }
    } catch (e) {
      console.error(`Error: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }
}

// =============================================================================
// CLI
// =============================================================================
async function main() {
  const args = process.argv.slice(2);
  const continuous = args.includes('--continuous');
  const blocksArg = args.find(a => a.startsWith('--blocks='));
  const numBlocks = blocksArg ? parseInt(blocksArg.split('=')[1]) : 30;

  if (continuous) {
    await continuousMonitor();
  } else {
    await analyzeRecentBlocks(numBlocks);
  }
}

main().catch(console.error);
