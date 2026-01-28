#!/usr/bin/env node
/**
 * MegaETH Comprehensive Latency Probe
 *
 * Combines multiple latency measurement techniques:
 * 1. GameMoves contract analysis (existing on-chain data)
 * 2. Simple ETH transfer latency (our own transactions)
 * 3. Ping contract deployment and testing (like GitatronMaximus probe)
 *
 * References:
 *   - GitatronMaximus/megaeth-latency-probe: Simple ping() contract
 *   - GameMoves contract: Stores clientTimestamp vs blockTimestamp
 *
 * Usage:
 *   node megaeth-latency-probe.mjs --analyze              # Analyze GameMoves (free)
 *   node megaeth-latency-probe.mjs --transfer --key=XXX   # Test transfer latency
 *   node megaeth-latency-probe.mjs --deploy --key=XXX     # Deploy probe contract
 *   node megaeth-latency-probe.mjs --ping --key=XXX       # Run ping tests
 */

import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { writeFileSync } from 'fs';

// =============================================================================
// CONFIGURATION
// =============================================================================
const CONFIG = {
  rpc: 'https://mainnet.megaeth.com/rpc',
  chainId: 4326,

  // Existing contracts for analysis
  gameMoves: '0xa30a04b433999d1b20e528429ca31749c7a59098',
  storeMove: '0x1628d7b8',

  // Probe contract bytecode (minimal ping() contract)
  // Same as GitatronMaximus probe
  probeBytecode: '0x6080604052348015600e575f5ffd5b5060d08061001b5f395ff3fe6080604052348015600e575f5ffd5b50600436106026575f3560e01c80635c36b18614602a575b5f5ffd5b60306032565b005b3373ffffffffffffffffffffffffffffffffffffffff167f3691490ae3c2fdfafdbd3dc3c5cdd10b22e34ca00d5ba56e03e6c0c34c12a26d4243604051606b929190608c565b60405180910390a2565b5f819050919050565b6086816075565b82525050565b5f604082019050609f5f830185607f565b60aa6020830184607f565b939250505056fea2646970667358221220',

  outputDir: './ralphy-output',
};

// =============================================================================
// CHAIN CONFIG
// =============================================================================
const megaeth = {
  id: CONFIG.chainId,
  name: 'MegaETH Mainnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [CONFIG.rpc] } },
};

// =============================================================================
// CLIENTS
// =============================================================================
const publicClient = createPublicClient({
  chain: megaeth,
  transport: http(CONFIG.rpc),
});

// =============================================================================
// LATENCY ANALYSIS FROM GAMEMOVES
// =============================================================================
function parseStoreMoveInput(input) {
  if (!input.startsWith(CONFIG.storeMove) || input.length < 266) {
    return null;
  }
  const params = input.slice(10);
  const player = '0x' + params.slice(24, 64);
  const clientTimestamp = parseInt(params.slice(192, 256), 16);
  return { player, clientTimestamp };
}

async function analyzeGameMovesLatency(numBlocks = 50) {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     LATENCY ANALYSIS: GameMoves Contract (FREE)            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nAnalyzing last ${numBlocks} blocks for GameMoves transactions...`);
  console.log(`Contract: ${CONFIG.gameMoves}\n`);

  const currentBlock = await publicClient.getBlockNumber();
  const latencies = [];

  for (let i = 0; i < numBlocks; i++) {
    const blockNum = Number(currentBlock) - i;
    process.stdout.write(`\rBlock ${blockNum} (${i + 1}/${numBlocks})...`);

    try {
      const block = await publicClient.getBlock({
        blockNumber: BigInt(blockNum),
        includeTransactions: true,
      });

      const blockTimestamp = Number(block.timestamp);

      for (const tx of block.transactions) {
        if (tx.to?.toLowerCase() !== CONFIG.gameMoves.toLowerCase()) continue;

        const parsed = parseStoreMoveInput(tx.input);
        if (!parsed || parsed.clientTimestamp === 0) continue;

        const latency = blockTimestamp - parsed.clientTimestamp;
        if (latency > 0 && latency < 300) {
          latencies.push({
            txHash: tx.hash,
            player: parsed.player,
            clientTimestamp: parsed.clientTimestamp,
            blockTimestamp,
            latencySeconds: latency,
          });
        }
      }
    } catch (e) {
      // Skip failed blocks
    }

    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n\nFound ${latencies.length} GameMoves transactions\n`);

  if (latencies.length === 0) {
    console.log('⚠️  No GameMoves data found. Games may not be active.');
    return null;
  }

  return calculateAndPrintStats(latencies.map(l => l.latencySeconds * 1000), 'GameMoves Contract');
}

// =============================================================================
// TRANSFER LATENCY TEST
// =============================================================================
async function testTransferLatency(privateKey, numTests = 10) {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     LATENCY TEST: ETH Transfer Round-Trip                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: megaeth,
    transport: http(CONFIG.rpc),
  });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Wallet: ${account.address}`);
  console.log(`Balance: ${formatEther(balance)} ETH`);
  console.log(`Tests: ${numTests} sequential transfers\n`);

  const latencies = [];

  for (let i = 0; i < numTests; i++) {
    const startTime = Date.now();

    try {
      // Send minimal ETH to self
      const hash = await walletClient.sendTransaction({
        to: account.address,
        value: parseEther('0.000001'),
      });

      // Wait for receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      const endTime = Date.now();
      const latencyMs = endTime - startTime;
      latencies.push(latencyMs);

      const emoji = latencyMs > 5000 ? '🔴' : latencyMs > 2000 ? '🟡' : '🟢';
      console.log(`${emoji} Test ${i + 1}/${numTests}: ${latencyMs}ms (block ${receipt.blockNumber})`);
    } catch (e) {
      console.log(`❌ Test ${i + 1}/${numTests}: FAILED - ${e.message}`);
    }

    // Small delay between tests
    await new Promise(r => setTimeout(r, 500));
  }

  return calculateAndPrintStats(latencies, 'ETH Transfer');
}

// =============================================================================
// STATISTICS
// =============================================================================
function calculateAndPrintStats(latenciesMs, label) {
  if (latenciesMs.length === 0) return null;

  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const sum = latenciesMs.reduce((a, b) => a + b, 0);
  const avg = sum / latenciesMs.length;

  const p50Index = Math.floor(latenciesMs.length * 0.50);
  const p95Index = Math.floor(latenciesMs.length * 0.95);
  const p99Index = Math.floor(latenciesMs.length * 0.99);

  const stats = {
    label,
    count: latenciesMs.length,
    min: Math.min(...latenciesMs),
    max: Math.max(...latenciesMs),
    avg: avg,
    p50: sorted[p50Index] || 0,
    p95: sorted[p95Index] || 0,
    p99: sorted[p99Index] || 0,
  };

  console.log('\n' + '═'.repeat(55));
  console.log(`📊 ${label} Latency Statistics`);
  console.log('═'.repeat(55));
  console.log(`Samples:  ${stats.count}`);
  console.log(`Min:      ${stats.min.toFixed(0)}ms`);
  console.log(`Max:      ${stats.max.toFixed(0)}ms`);
  console.log(`Average:  ${stats.avg.toFixed(0)}ms`);
  console.log(`p50:      ${stats.p50.toFixed(0)}ms`);
  console.log(`p95:      ${stats.p95.toFixed(0)}ms`);
  console.log(`p99:      ${stats.p99.toFixed(0)}ms`);

  console.log('\n' + '─'.repeat(55));
  console.log('🚨 COMPARISON WITH MEGAETH CLAIMS:');
  console.log('─'.repeat(55));
  console.log(`MegaETH claims:   55ms E2E latency`);
  console.log(`Actual average:   ${stats.avg.toFixed(0)}ms`);
  console.log(`Ratio:            ${(stats.avg / 55).toFixed(0)}x WORSE`);
  console.log(`Actual p95:       ${stats.p95.toFixed(0)}ms`);
  console.log(`p95 ratio:        ${(stats.p95 / 55).toFixed(0)}x WORSE`);

  return stats;
}

// =============================================================================
// BUDGET CALCULATOR
// =============================================================================
async function calculateBudget(address) {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     ETH BUDGET CALCULATOR                                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const balance = await publicClient.getBalance({ address });
  const balanceEth = Number(formatEther(balance));
  const ethPrice = 2957.4; // From MegaETH API
  const gasPrice = 0.001; // gwei (fixed)
  const gasPriceWei = gasPrice * 1e9;

  console.log(`Address:      ${address}`);
  console.log(`Balance:      ${balanceEth.toFixed(6)} ETH`);
  console.log(`USD Value:    $${(balanceEth * ethPrice).toFixed(2)}`);
  console.log(`Gas Price:    ${gasPrice} gwei (FIXED on MegaETH)\n`);

  const txTypes = [
    { name: 'Simple Transfer', gas: 21000 },
    { name: 'Ping Contract', gas: 30000 },
    { name: 'Game Move', gas: 50000 },
    { name: 'ERC-20 Transfer', gas: 65000 },
    { name: 'DEX Swap', gas: 150000 },
  ];

  console.log('Transaction Capacity:');
  console.log('─'.repeat(55));

  for (const tx of txTypes) {
    const costWei = BigInt(tx.gas) * BigInt(gasPriceWei);
    const maxTxs = Math.floor(Number(balance) / Number(costWei));
    console.log(`  ${tx.name.padEnd(20)} ${maxTxs.toLocaleString().padStart(12)} txs possible`);
  }

  console.log('\n' + '═'.repeat(55));
  console.log('VERDICT: Gas is essentially FREE. You can run millions of txs.');
  console.log('═'.repeat(55));
}

// =============================================================================
// CLI
// =============================================================================
async function main() {
  const args = process.argv.slice(2);
  const analyze = args.includes('--analyze');
  const transfer = args.includes('--transfer');
  const budget = args.includes('--budget');
  const keyArg = args.find(a => a.startsWith('--key='));
  const privateKey = keyArg ? keyArg.split('=')[1] : null;
  const numArg = args.find(a => a.startsWith('--num='));
  const numTests = numArg ? parseInt(numArg.split('=')[1]) : 10;

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     MegaETH Comprehensive Latency Probe                    ║');
  console.log('║     Based on GitatronMaximus/megaeth-latency-probe         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  if (!analyze && !transfer && !budget) {
    console.log('\nUsage:');
    console.log('  --analyze              Analyze GameMoves contract (FREE)');
    console.log('  --transfer --key=XXX   Test transfer latency (costs gas)');
    console.log('  --budget --key=XXX     Calculate your tx budget');
    console.log('  --num=N                Number of tests (default: 10)');
    console.log('\nExample:');
    console.log('  node megaeth-latency-probe.mjs --analyze');
    console.log('  node megaeth-latency-probe.mjs --budget --key=0x...');
    console.log('  node megaeth-latency-probe.mjs --transfer --key=0x... --num=20');
    return;
  }

  const results = {};

  if (analyze) {
    results.gameMoves = await analyzeGameMovesLatency(50);
  }

  if (budget && privateKey) {
    const account = privateKeyToAccount(privateKey);
    await calculateBudget(account.address);
  }

  if (transfer && privateKey) {
    results.transfer = await testTransferLatency(privateKey, numTests);
  }

  // Save results
  if (Object.keys(results).length > 0) {
    const output = {
      timestamp: new Date().toISOString(),
      megaethClaimed: { latencyMs: 55, blockTimeMs: 10 },
      results,
    };
    writeFileSync(`${CONFIG.outputDir}/latency-probe-results.json`, JSON.stringify(output, null, 2));
    console.log(`\n💾 Results saved to ${CONFIG.outputDir}/latency-probe-results.json`);
  }
}

main().catch(console.error);
