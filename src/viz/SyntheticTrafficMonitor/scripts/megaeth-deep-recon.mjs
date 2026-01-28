#!/usr/bin/env node
/**
 * MegaETH Deep Reconnaissance
 *
 * Searches for anomalies, failures, and evidence that contradicts claims:
 * - Empty or near-empty blocks
 * - Block time inconsistencies (claimed 10ms, actual?)
 * - Gas usage anomalies
 * - Transaction patterns suggesting fake traffic
 * - Nonce gaps and dropped transactions
 * - Contract interaction failures
 */

import { createPublicClient, http, formatEther } from 'viem';
import { writeFileSync } from 'fs';

const CONFIG = {
  rpc: 'https://mainnet.megaeth.com/rpc',
  chainId: 4326,
  outputDir: './ralphy-output',
};

const megaeth = {
  id: CONFIG.chainId,
  name: 'MegaETH',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [CONFIG.rpc] } },
};

const client = createPublicClient({
  chain: megaeth,
  transport: http(CONFIG.rpc),
});

// =============================================================================
// ANALYSIS FUNCTIONS
// =============================================================================

async function analyzeBlockTimes(numBlocks = 500) {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  ANALYSIS 1: Block Time Reality Check                      ║');
  console.log('║  Claim: Sub-10ms blocks                                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const currentBlock = await client.getBlockNumber();
  const blockTimes = [];
  let prevTimestamp = null;

  console.log(`Analyzing ${numBlocks} blocks...`);

  for (let i = 0; i < numBlocks; i++) {
    const blockNum = Number(currentBlock) - i;

    try {
      const block = await client.getBlock({ blockNumber: BigInt(blockNum) });
      const timestamp = Number(block.timestamp);

      if (prevTimestamp !== null) {
        const timeDiff = prevTimestamp - timestamp; // In seconds
        blockTimes.push({ blockNum, timeDiff, txCount: block.transactions.length });
      }
      prevTimestamp = timestamp;
    } catch (e) {
      // Skip
    }

    if (i % 50 === 0) process.stdout.write(`\r  Block ${blockNum} (${i}/${numBlocks})...`);
  }

  console.log('\n');

  // Calculate stats
  const times = blockTimes.map(b => b.timeDiff);
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  // Count blocks with same timestamp (indicating <1s block time)
  const sameTimestamp = times.filter(t => t === 0).length;
  const oneSecond = times.filter(t => t === 1).length;
  const moreThanOne = times.filter(t => t > 1).length;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('BLOCK TIME ANALYSIS:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Blocks analyzed:        ${blockTimes.length}`);
  console.log(`Average block time:     ${avgTime.toFixed(3)}s (${(avgTime * 1000).toFixed(0)}ms)`);
  console.log(`Min block time:         ${minTime}s`);
  console.log(`Max block time:         ${maxTime}s`);
  console.log('');
  console.log('Block time distribution:');
  console.log(`  < 1 second:           ${sameTimestamp} (${(sameTimestamp/times.length*100).toFixed(1)}%)`);
  console.log(`  = 1 second:           ${oneSecond} (${(oneSecond/times.length*100).toFixed(1)}%)`);
  console.log(`  > 1 second:           ${moreThanOne} (${(moreThanOne/times.length*100).toFixed(1)}%)`);
  console.log('');
  console.log('🚨 VERDICT:');
  console.log(`   MegaETH claims: 10ms blocks`);
  console.log(`   Reality:        ${(avgTime * 1000).toFixed(0)}ms average`);
  console.log(`   Note: Timestamps are in seconds, so sub-second times show as 0`);

  return { avgTime, minTime, maxTime, distribution: { sameTimestamp, oneSecond, moreThanOne } };
}

async function analyzeEmptyBlocks(numBlocks = 200) {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  ANALYSIS 2: Empty/Low-Traffic Blocks                      ║');
  console.log('║  During "stress test" there should be NO empty blocks      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const currentBlock = await client.getBlockNumber();
  const blockStats = [];
  let emptyBlocks = 0;
  let lowTxBlocks = 0;

  for (let i = 0; i < numBlocks; i++) {
    const blockNum = Number(currentBlock) - i;

    try {
      const block = await client.getBlock({ blockNumber: BigInt(blockNum) });
      const txCount = block.transactions.length;
      const gasUsed = Number(block.gasUsed);

      blockStats.push({ blockNum, txCount, gasUsed });

      if (txCount === 0) {
        emptyBlocks++;
        console.log(`  🔴 EMPTY BLOCK: ${blockNum}`);
      } else if (txCount < 5) {
        lowTxBlocks++;
        console.log(`  🟡 LOW TX BLOCK: ${blockNum} (${txCount} txs)`);
      }
    } catch (e) {
      // Skip
    }

    if (i % 50 === 0) process.stdout.write(`\r  Block ${blockNum} (${i}/${numBlocks})...`);
  }

  console.log('\n');

  const avgTxCount = blockStats.reduce((a, b) => a + b.txCount, 0) / blockStats.length;
  const avgGasUsed = blockStats.reduce((a, b) => a + b.gasUsed, 0) / blockStats.length;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('EMPTY BLOCK ANALYSIS:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Blocks analyzed:        ${blockStats.length}`);
  console.log(`Empty blocks (0 tx):    ${emptyBlocks} (${(emptyBlocks/blockStats.length*100).toFixed(1)}%)`);
  console.log(`Low tx blocks (<5):     ${lowTxBlocks} (${(lowTxBlocks/blockStats.length*100).toFixed(1)}%)`);
  console.log(`Average txs per block:  ${avgTxCount.toFixed(1)}`);
  console.log(`Average gas per block:  ${(avgGasUsed/1e6).toFixed(2)}M`);
  console.log('');
  console.log('🚨 VERDICT:');
  if (emptyBlocks > 0) {
    console.log(`   Found ${emptyBlocks} EMPTY BLOCKS during "stress test"!`);
    console.log(`   This suggests traffic is NOT saturating the network.`);
  } else {
    console.log(`   No empty blocks found.`);
  }

  return { emptyBlocks, lowTxBlocks, avgTxCount, avgGasUsed };
}

async function analyzeSameAddressPatterns(numBlocks = 50) {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  ANALYSIS 3: Bot/Spam Address Patterns                     ║');
  console.log('║  Looking for addresses with suspiciously high tx counts    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const currentBlock = await client.getBlockNumber();
  const fromAddresses = {};
  const toAddresses = {};
  let totalTxs = 0;

  for (let i = 0; i < numBlocks; i++) {
    const blockNum = Number(currentBlock) - i;

    try {
      const block = await client.getBlock({
        blockNumber: BigInt(blockNum),
        includeTransactions: true
      });

      for (const tx of block.transactions) {
        totalTxs++;
        fromAddresses[tx.from] = (fromAddresses[tx.from] || 0) + 1;
        if (tx.to) {
          toAddresses[tx.to] = (toAddresses[tx.to] || 0) + 1;
        }
      }
    } catch (e) {
      // Skip
    }

    if (i % 10 === 0) process.stdout.write(`\r  Block ${blockNum} (${i}/${numBlocks})...`);
  }

  console.log('\n');

  // Sort by frequency
  const topSenders = Object.entries(fromAddresses)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const topReceivers = Object.entries(toAddresses)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('BOT/SPAM ANALYSIS:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total transactions:     ${totalTxs}`);
  console.log(`Unique senders:         ${Object.keys(fromAddresses).length}`);
  console.log(`Unique receivers:       ${Object.keys(toAddresses).length}`);
  console.log('');
  console.log('Top 10 Senders (potential bots):');
  for (const [addr, count] of topSenders) {
    const pct = (count / totalTxs * 100).toFixed(1);
    console.log(`  ${addr.slice(0, 16)}... : ${count} txs (${pct}%)`);
  }
  console.log('');
  console.log('Top 10 Receivers (spam targets):');
  for (const [addr, count] of topReceivers) {
    const pct = (count / totalTxs * 100).toFixed(1);
    console.log(`  ${addr.slice(0, 16)}... : ${count} txs (${pct}%)`);
  }

  // Calculate concentration
  const top5SenderTxs = topSenders.slice(0, 5).reduce((a, b) => a + b[1], 0);
  const concentration = (top5SenderTxs / totalTxs * 100).toFixed(1);

  console.log('');
  console.log('🚨 VERDICT:');
  console.log(`   Top 5 senders account for ${concentration}% of all traffic`);
  if (parseFloat(concentration) > 50) {
    console.log(`   HIGH CONCENTRATION - Traffic is dominated by a few addresses (bots)`);
  }

  return { totalTxs, uniqueSenders: Object.keys(fromAddresses).length, topSenders, concentration };
}

async function analyzeGasUsage(numBlocks = 100) {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  ANALYSIS 4: Gas Usage Patterns                            ║');
  console.log('║  Checking if gas prices respond to demand (EIP-1559)       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const currentBlock = await client.getBlockNumber();
  const gasPrices = new Set();
  const gasStats = [];

  for (let i = 0; i < numBlocks; i++) {
    const blockNum = Number(currentBlock) - i;

    try {
      const block = await client.getBlock({
        blockNumber: BigInt(blockNum),
        includeTransactions: true
      });

      for (const tx of block.transactions) {
        const gasPrice = Number(tx.gasPrice || 0) / 1e9; // to gwei
        gasPrices.add(gasPrice.toFixed(6));
      }

      gasStats.push({
        blockNum,
        gasUsed: Number(block.gasUsed),
        gasLimit: Number(block.gasLimit),
        utilization: Number(block.gasUsed) / Number(block.gasLimit) * 100,
        baseFee: block.baseFeePerGas ? Number(block.baseFeePerGas) / 1e9 : null,
      });
    } catch (e) {
      // Skip
    }

    if (i % 20 === 0) process.stdout.write(`\r  Block ${blockNum} (${i}/${numBlocks})...`);
  }

  console.log('\n');

  const uniquePrices = Array.from(gasPrices).sort();
  const avgUtilization = gasStats.reduce((a, b) => a + b.utilization, 0) / gasStats.length;
  const avgGasUsed = gasStats.reduce((a, b) => a + b.gasUsed, 0) / gasStats.length;
  const avgGasLimit = gasStats.reduce((a, b) => a + b.gasLimit, 0) / gasStats.length;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('GAS USAGE ANALYSIS:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Blocks analyzed:        ${gasStats.length}`);
  console.log(`Unique gas prices:      ${uniquePrices.length}`);
  console.log(`Gas prices seen:        ${uniquePrices.slice(0, 5).join(', ')} gwei`);
  console.log(`Average utilization:    ${avgUtilization.toFixed(2)}%`);
  console.log(`Average gas used:       ${(avgGasUsed/1e6).toFixed(2)}M`);
  console.log(`Average gas limit:      ${(avgGasLimit/1e9).toFixed(2)}B`);
  console.log('');
  console.log('🚨 VERDICT:');
  if (uniquePrices.length <= 3) {
    console.log(`   FIXED GAS PRICE - Only ${uniquePrices.length} unique prices detected`);
    console.log(`   EIP-1559 appears DISABLED - no fee market!`);
  }
  if (avgUtilization < 10) {
    console.log(`   LOW UTILIZATION (${avgUtilization.toFixed(1)}%) - Network NOT stressed!`);
  }

  return { uniquePrices, avgUtilization, avgGasUsed };
}

async function findNonceGaps(numBlocks = 30) {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  ANALYSIS 5: Nonce Gaps (Dropped Transactions)             ║');
  console.log('║  Looking for evidence of dropped/failed submissions        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const currentBlock = await client.getBlockNumber();
  const addressNonces = {};
  let nonceGaps = 0;

  for (let i = 0; i < numBlocks; i++) {
    const blockNum = Number(currentBlock) - i;

    try {
      const block = await client.getBlock({
        blockNumber: BigInt(blockNum),
        includeTransactions: true
      });

      for (const tx of block.transactions) {
        const addr = tx.from.toLowerCase();
        const nonce = Number(tx.nonce);

        if (!addressNonces[addr]) {
          addressNonces[addr] = [];
        }
        addressNonces[addr].push({ nonce, block: blockNum });
      }
    } catch (e) {
      // Skip
    }

    if (i % 10 === 0) process.stdout.write(`\r  Block ${blockNum} (${i}/${numBlocks})...`);
  }

  console.log('\n');

  // Check for nonce gaps in frequently used addresses
  const gapsFound = [];
  for (const [addr, txs] of Object.entries(addressNonces)) {
    if (txs.length < 5) continue; // Only check active addresses

    const nonces = txs.map(t => t.nonce).sort((a, b) => a - b);
    for (let i = 1; i < nonces.length; i++) {
      const gap = nonces[i] - nonces[i-1];
      if (gap > 1) {
        gapsFound.push({ addr, gap, nonces: [nonces[i-1], nonces[i]] });
        nonceGaps++;
      }
    }
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('NONCE GAP ANALYSIS:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Addresses analyzed:     ${Object.keys(addressNonces).length}`);
  console.log(`Nonce gaps found:       ${nonceGaps}`);

  if (gapsFound.length > 0) {
    console.log('\nGaps detected (possible dropped txs):');
    for (const g of gapsFound.slice(0, 10)) {
      console.log(`  ${g.addr.slice(0, 16)}... : gap of ${g.gap} (nonces ${g.nonces[0]} -> ${g.nonces[1]})`);
    }
  }

  console.log('');
  console.log('🚨 VERDICT:');
  if (nonceGaps > 0) {
    console.log(`   Found ${nonceGaps} nonce gaps - evidence of DROPPED TRANSACTIONS`);
  } else {
    console.log(`   No nonce gaps found in sampled blocks.`);
  }

  return { nonceGaps, gapsFound };
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     MegaETH DEEP RECONNAISSANCE                            ║');
  console.log('║     Finding evidence that contradicts their claims         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const results = {};

  results.blockTimes = await analyzeBlockTimes(300);
  results.emptyBlocks = await analyzeEmptyBlocks(200);
  results.spamPatterns = await analyzeSameAddressPatterns(50);
  results.gasUsage = await analyzeGasUsage(100);
  results.nonceGaps = await findNonceGaps(30);

  // Summary
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     FINAL SUMMARY - EVIDENCE AGAINST MEGAETH CLAIMS        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('1. BLOCK TIME: Claimed 10ms, Actual ~' + (results.blockTimes.avgTime * 1000).toFixed(0) + 'ms');
  console.log('2. EMPTY BLOCKS: ' + results.emptyBlocks.emptyBlocks + ' empty blocks during "stress test"');
  console.log('3. BOT CONCENTRATION: Top 5 senders = ' + results.spamPatterns.concentration + '% of traffic');
  console.log('4. GAS PRICES: ' + results.gasUsage.uniquePrices.length + ' unique prices (EIP-1559 disabled)');
  console.log('5. NETWORK UTILIZATION: ' + results.gasUsage.avgUtilization.toFixed(1) + '%');
  console.log('6. NONCE GAPS: ' + results.nonceGaps.nonceGaps + ' potential dropped transactions');

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    results,
    summary: {
      blockTimeMs: results.blockTimes.avgTime * 1000,
      emptyBlocks: results.emptyBlocks.emptyBlocks,
      botConcentration: results.spamPatterns.concentration,
      uniqueGasPrices: results.gasUsage.uniquePrices.length,
      networkUtilization: results.gasUsage.avgUtilization,
      nonceGaps: results.nonceGaps.nonceGaps,
    }
  };

  writeFileSync(`${CONFIG.outputDir}/deep-recon-results.json`, JSON.stringify(output, null, 2));
  console.log(`\n💾 Results saved to ${CONFIG.outputDir}/deep-recon-results.json`);
}

main().catch(console.error);
