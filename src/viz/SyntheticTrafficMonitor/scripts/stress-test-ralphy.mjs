#!/usr/bin/env node
/**
 * MegaETH Stress Test - "Ralphy Loop"
 *
 * PURPOSE: Participate in MegaETH's official stress test (Jan 22, 2026)
 * and measure REAL network performance under load.
 *
 * MEASURES:
 * - Transaction inclusion time (submission → confirmation)
 * - Gas price behavior (does it actually change?)
 * - Transaction failure rates
 * - Latency under load
 * - Network congestion patterns
 *
 * USAGE:
 *   node stress-test-ralphy.mjs --mode=monitor          # Just monitor (no txs)
 *   node stress-test-ralphy.mjs --mode=stress --key=... # Send stress txs
 *   node stress-test-ralphy.mjs --mode=analyze          # Analyze collected data
 */

import { createPublicClient, createWalletClient, http, parseEther, formatEther, formatGwei } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// =============================================================================
// CONFIGURATION
// =============================================================================
const RPC_URL = 'https://mainnet.megaeth.com/rpc';
const CHAIN_ID = 4326;
const EXPLORER = 'https://megaeth.blockscout.com';

// Known synthetic traffic contracts
const UNIVERSAL_ROUTER = '0xaab1c664cead881afbb58555e6a3a79523d3e4c0';
const DUST_AMOUNT = 3n; // 3 wei - the spam signature

// Whitelisted stress test apps (from MegaETH announcement)
const STRESS_TEST_APPS = {
  crossyFluffle: '0x05bE74062e1482616c0E8C7553e6476EfC9Cd43E',
  // Add Stomp.gg and Smasher contracts when discovered
};

// Data collection
const DATA_FILE = './stress-test-data.json';
let collectedData = {
  startTime: Date.now(),
  samples: [],
  txResults: [],
  anomalies: [],
};

// =============================================================================
// VIEM CLIENT SETUP
// =============================================================================
const megaeth = {
  id: CHAIN_ID,
  name: 'MegaETH',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'Blockscout', url: EXPLORER } },
};

const publicClient = createPublicClient({
  chain: megaeth,
  transport: http(RPC_URL),
});

// =============================================================================
// NETWORK MONITORING
// =============================================================================
async function getNetworkState() {
  const [blockNumber, gasPrice, block] = await Promise.all([
    publicClient.getBlockNumber(),
    publicClient.getGasPrice(),
    publicClient.getBlock({ blockTag: 'latest', includeTransactions: true }),
  ]);

  const txs = block.transactions || [];

  // Classify transactions
  let dexSwapCount = 0;
  let dustTransferCount = 0;
  let organicCount = 0;
  const uniqueSenders = new Set();

  for (const tx of txs) {
    uniqueSenders.add(tx.from);
    const to = tx.to?.toLowerCase();
    const value = tx.value;
    const input = tx.input;

    if (to === UNIVERSAL_ROUTER.toLowerCase()) {
      dexSwapCount++;
    } else if (input === '0x' && value === DUST_AMOUNT) {
      dustTransferCount++;
    } else if (tx.from !== '0xdeaddeaddeaddeaddeaddeaddeaddeaddead0001') {
      organicCount++;
    }
  }

  const syntheticCount = dexSwapCount + dustTransferCount;
  const syntheticPct = txs.length > 0 ? (syntheticCount / txs.length * 100) : 0;

  return {
    timestamp: Date.now(),
    blockNumber: Number(blockNumber),
    blockTimestamp: Number(block.timestamp),
    gasPrice: gasPrice,
    gasPriceGwei: formatGwei(gasPrice),
    txCount: txs.length,
    gasUsed: Number(block.gasUsed),
    gasLimit: Number(block.gasLimit),
    gasUtilization: Number(block.gasUsed) / Number(block.gasLimit) * 100,
    uniqueSenders: uniqueSenders.size,
    breakdown: {
      dexSwaps: dexSwapCount,
      dustTransfers: dustTransferCount,
      organic: organicCount,
      syntheticPct: syntheticPct.toFixed(1),
    },
  };
}

async function calculateTPS(windowSeconds = 5) {
  const currentBlock = await publicClient.getBlock({ blockTag: 'latest' });
  const currentTime = Number(currentBlock.timestamp);

  // Get blocks from the last N seconds
  let totalTxs = 0;
  let blocksChecked = 0;
  let blockNum = Number(currentBlock.number);

  while (blocksChecked < 50) { // Check up to 50 blocks back
    try {
      const block = await publicClient.getBlock({ blockNumber: BigInt(blockNum) });
      const blockTime = Number(block.timestamp);

      if (currentTime - blockTime > windowSeconds) break;

      totalTxs += block.transactions.length;
      blocksChecked++;
      blockNum--;
    } catch (e) {
      break;
    }
  }

  return totalTxs / windowSeconds;
}

// =============================================================================
// STRESS TEST FUNCTIONS
// =============================================================================
async function sendStressTransaction(walletClient, account, targetAddress, data = '0x') {
  const startTime = performance.now();

  try {
    // Get nonce
    const nonce = await publicClient.getTransactionCount({ address: account.address });

    // Prepare transaction
    const tx = {
      to: targetAddress,
      value: parseEther('0.0001'), // Small amount for testing
      data: data,
      nonce: nonce,
      gas: 100000n,
    };

    // Send transaction
    const hash = await walletClient.sendTransaction(tx);
    const submitTime = performance.now();

    console.log(`📤 TX submitted: ${hash.slice(0, 18)}... (${(submitTime - startTime).toFixed(0)}ms)`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60000 });
    const confirmTime = performance.now();

    const result = {
      hash,
      success: receipt.status === 'success',
      submitLatency: submitTime - startTime,
      confirmLatency: confirmTime - startTime,
      gasUsed: Number(receipt.gasUsed),
      blockNumber: Number(receipt.blockNumber),
      timestamp: Date.now(),
    };

    console.log(`✅ TX confirmed: ${receipt.status} in ${result.confirmLatency.toFixed(0)}ms (block ${result.blockNumber})`);

    return result;
  } catch (error) {
    const failTime = performance.now();
    console.error(`❌ TX failed: ${error.message}`);

    return {
      success: false,
      error: error.message,
      latency: failTime - startTime,
      timestamp: Date.now(),
    };
  }
}

async function runStressTest(privateKey, txCount = 5, delayMs = 10000) {
  console.log('\n🚀 Starting Stress Test');
  console.log('========================');
  console.log(`Transactions: ${txCount}`);
  console.log(`Delay between txs: ${delayMs}ms`);

  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: megaeth,
    transport: http(RPC_URL),
  });

  console.log(`\n📍 Wallet: ${account.address}`);

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`💰 Balance: ${formatEther(balance)} ETH`);

  if (balance < parseEther('0.01')) {
    console.error('❌ Insufficient balance for stress test');
    return;
  }

  const results = [];

  // Send transactions
  for (let i = 0; i < txCount; i++) {
    console.log(`\n--- Transaction ${i + 1}/${txCount} ---`);

    // Get baseline metrics before sending
    const beforeState = await getNetworkState();

    // Send to a random address (self-transfer for testing)
    const result = await sendStressTransaction(walletClient, account, account.address);
    result.beforeState = beforeState;

    // Get metrics after confirmation
    if (result.success) {
      result.afterState = await getNetworkState();
    }

    results.push(result);
    collectedData.txResults.push(result);

    // Delay between transactions
    if (i < txCount - 1 && delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  // Analyze results
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log('\n📊 Stress Test Results');
  console.log('========================');
  console.log(`Total: ${results.length}`);
  console.log(`Success: ${successful.length} (${(successful.length/results.length*100).toFixed(1)}%)`);
  console.log(`Failed: ${failed.length}`);

  if (successful.length > 0) {
    const avgSubmit = successful.reduce((a, r) => a + r.submitLatency, 0) / successful.length;
    const avgConfirm = successful.reduce((a, r) => a + r.confirmLatency, 0) / successful.length;
    const avgGas = successful.reduce((a, r) => a + r.gasUsed, 0) / successful.length;

    console.log(`\nLatency (avg):`);
    console.log(`  Submit: ${avgSubmit.toFixed(0)}ms`);
    console.log(`  Confirm: ${avgConfirm.toFixed(0)}ms`);
    console.log(`  Gas used: ${avgGas.toFixed(0)}`);
  }

  // Save data
  saveData();

  return results;
}

// =============================================================================
// MONITORING LOOP
// =============================================================================
async function monitorLoop(intervalMs = 2000) {  // 2 second interval to avoid rate limits
  console.log('\n👁️  Starting Monitor Mode');
  console.log('==========================');
  console.log('Press Ctrl+C to stop and save data\n');

  let lastBlockNumber = 0;
  let lastGasPrice = 0n;
  let sampleCount = 0;

  const monitor = async () => {
    try {
      const state = await getNetworkState();
      const tps = await calculateTPS(5);

      sampleCount++;
      collectedData.samples.push({ ...state, tps });

      // Detect anomalies
      const anomalies = [];

      // Gas price change (should be fixed at 0.001 gwei on MegaETH)
      if (lastGasPrice > 0n && state.gasPrice !== lastGasPrice) {
        anomalies.push(`GAS PRICE CHANGED: ${formatGwei(lastGasPrice)} → ${state.gasPriceGwei} gwei`);
      }

      // High gas utilization
      if (state.gasUtilization > 80) {
        anomalies.push(`HIGH GAS UTILIZATION: ${state.gasUtilization.toFixed(1)}%`);
      }

      // TPS drop
      if (tps < 100 && state.breakdown.syntheticPct < 50) {
        anomalies.push(`LOW TPS: ${tps.toFixed(0)} - Synthetic load may be OFF`);
      }

      // Store anomalies
      if (anomalies.length > 0) {
        collectedData.anomalies.push({
          timestamp: Date.now(),
          blockNumber: state.blockNumber,
          anomalies,
        });
      }

      // Print status
      const statusLine = [
        `#${state.blockNumber}`,
        `TPS: ${tps.toFixed(0)}`,
        `Gas: ${state.gasPriceGwei} gwei`,
        `TXs: ${state.txCount}`,
        `Synth: ${state.breakdown.syntheticPct}%`,
        `(DEX: ${state.breakdown.dexSwaps}, Dust: ${state.breakdown.dustTransfers})`,
      ].join(' | ');

      process.stdout.write(`\r[${new Date().toLocaleTimeString()}] ${statusLine}    `);

      if (anomalies.length > 0) {
        console.log(`\n🚨 ANOMALY: ${anomalies.join(', ')}`);
      }

      lastBlockNumber = state.blockNumber;
      lastGasPrice = state.gasPrice;

      // Save periodically
      if (sampleCount % 60 === 0) {
        saveData();
        console.log(`\n💾 Data saved (${collectedData.samples.length} samples)`);
      }

    } catch (error) {
      console.error(`\n❌ Monitor error: ${error.message}`);
    }
  };

  // Run immediately, then on interval
  await monitor();
  setInterval(monitor, intervalMs);

  // Handle exit
  process.on('SIGINT', () => {
    console.log('\n\n📊 Saving final data...');
    saveData();
    console.log(`✅ Saved ${collectedData.samples.length} samples to ${DATA_FILE}`);
    process.exit(0);
  });
}

// =============================================================================
// DATA ANALYSIS
// =============================================================================
function analyzeData() {
  if (!existsSync(DATA_FILE)) {
    console.error('❌ No data file found. Run monitor mode first.');
    return;
  }

  const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));

  console.log('\n📊 MegaETH Stress Test Analysis');
  console.log('================================');
  console.log(`Data collected: ${new Date(data.startTime).toLocaleString()}`);
  console.log(`Samples: ${data.samples.length}`);
  console.log(`TX Results: ${data.txResults.length}`);
  console.log(`Anomalies: ${data.anomalies.length}`);

  if (data.samples.length > 0) {
    // TPS analysis
    const tpsValues = data.samples.map(s => s.tps).filter(t => t > 0);
    const avgTps = tpsValues.reduce((a, b) => a + b, 0) / tpsValues.length;
    const maxTps = Math.max(...tpsValues);
    const minTps = Math.min(...tpsValues);

    console.log('\n📈 TPS Statistics:');
    console.log(`  Average: ${avgTps.toFixed(0)}`);
    console.log(`  Peak: ${maxTps.toFixed(0)}`);
    console.log(`  Minimum: ${minTps.toFixed(0)}`);

    // Synthetic traffic analysis
    const syntheticPcts = data.samples.map(s => parseFloat(s.breakdown?.syntheticPct || 0));
    const avgSynthetic = syntheticPcts.reduce((a, b) => a + b, 0) / syntheticPcts.length;

    console.log('\n🤖 Synthetic Traffic:');
    console.log(`  Average: ${avgSynthetic.toFixed(1)}%`);
    console.log(`  This means ~${(100 - avgSynthetic).toFixed(1)}% is REAL traffic`);

    // Gas analysis
    const gasPrices = data.samples.map(s => s.gasPriceGwei);
    const uniqueGasPrices = [...new Set(gasPrices)];

    console.log('\n⛽ Gas Price:');
    console.log(`  Unique values seen: ${uniqueGasPrices.length}`);
    console.log(`  Values: ${uniqueGasPrices.join(', ')} gwei`);
    if (uniqueGasPrices.length === 1) {
      console.log(`  ⚠️  FIXED GAS PRICE - EIP-1559 appears DISABLED`);
    }

    // Gas utilization
    const gasUtils = data.samples.map(s => s.gasUtilization);
    const avgGasUtil = gasUtils.reduce((a, b) => a + b, 0) / gasUtils.length;
    const maxGasUtil = Math.max(...gasUtils);

    console.log('\n🔥 Gas Utilization:');
    console.log(`  Average: ${avgGasUtil.toFixed(1)}%`);
    console.log(`  Peak: ${maxGasUtil.toFixed(1)}%`);
  }

  if (data.txResults.length > 0) {
    const successful = data.txResults.filter(r => r.success);
    const failed = data.txResults.filter(r => !r.success);

    console.log('\n📤 Transaction Results:');
    console.log(`  Total: ${data.txResults.length}`);
    console.log(`  Success: ${successful.length} (${(successful.length/data.txResults.length*100).toFixed(1)}%)`);
    console.log(`  Failed: ${failed.length}`);

    if (successful.length > 0) {
      const latencies = successful.map(r => r.confirmLatency);
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);

      console.log('\n⏱️  Confirmation Latency:');
      console.log(`  Average: ${avgLatency.toFixed(0)}ms`);
      console.log(`  Min: ${minLatency.toFixed(0)}ms`);
      console.log(`  Max: ${maxLatency.toFixed(0)}ms`);
    }
  }

  if (data.anomalies.length > 0) {
    console.log('\n🚨 Anomalies Detected:');
    for (const a of data.anomalies.slice(-10)) {
      console.log(`  [${new Date(a.timestamp).toLocaleTimeString()}] Block ${a.blockNumber}: ${a.anomalies.join(', ')}`);
    }
  }

  // Key findings
  console.log('\n' + '='.repeat(50));
  console.log('🔑 KEY FINDINGS:');
  console.log('='.repeat(50));

  if (data.samples.length > 0) {
    const avgSynthetic = data.samples.map(s => parseFloat(s.breakdown?.syntheticPct || 0)).reduce((a, b) => a + b, 0) / data.samples.length;
    console.log(`1. ${avgSynthetic.toFixed(0)}% of traffic is SYNTHETIC (bots)`);
    console.log(`2. Real organic traffic: ~${(100 - avgSynthetic).toFixed(1)}%`);

    const gasPrices = [...new Set(data.samples.map(s => s.gasPriceGwei))];
    if (gasPrices.length === 1) {
      console.log(`3. Gas price is FIXED at ${gasPrices[0]} gwei (EIP-1559 disabled)`);
    }
  }
}

// =============================================================================
// SAVE/LOAD DATA
// =============================================================================
function saveData() {
  writeFileSync(DATA_FILE, JSON.stringify(collectedData, null, 2));
}

function loadData() {
  if (existsSync(DATA_FILE)) {
    collectedData = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  }
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
  const args = process.argv.slice(2);
  const mode = args.find(a => a.startsWith('--mode='))?.split('=')[1] || 'monitor';
  const privateKey = args.find(a => a.startsWith('--key='))?.split('=')[1];
  const txCount = parseInt(args.find(a => a.startsWith('--count='))?.split('=')[1] || '10');
  const delay = parseInt(args.find(a => a.startsWith('--delay='))?.split('=')[1] || '100');

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     MegaETH Stress Test - "Ralphy Loop"                   ║');
  console.log('║     Official Stress Test Participant & Analyzer           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`\nMode: ${mode.toUpperCase()}`);
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Chain ID: ${CHAIN_ID}`);

  // Load existing data
  loadData();

  // Quick network check
  try {
    const blockNumber = await publicClient.getBlockNumber();
    console.log(`\n✅ Connected! Latest block: ${blockNumber}`);
  } catch (error) {
    console.error(`\n❌ Cannot connect to MegaETH: ${error.message}`);
    process.exit(1);
  }

  switch (mode) {
    case 'monitor':
      await monitorLoop(1000);
      break;

    case 'stress':
      if (!privateKey) {
        console.error('\n❌ Stress mode requires --key=<private_key>');
        console.log('Example: node stress-test-ralphy.mjs --mode=stress --key=0x...');
        process.exit(1);
      }
      await runStressTest(privateKey, txCount, delay);
      break;

    case 'analyze':
      analyzeData();
      break;

    default:
      console.log('\nUsage:');
      console.log('  --mode=monitor   Monitor network (no wallet needed)');
      console.log('  --mode=stress    Send stress test transactions');
      console.log('  --mode=analyze   Analyze collected data');
      console.log('\nOptions:');
      console.log('  --key=0x...      Private key for stress mode');
      console.log('  --count=N        Number of transactions (default: 10)');
      console.log('  --delay=MS       Delay between txs in ms (default: 100)');
  }
}

main().catch(console.error);
