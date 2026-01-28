#!/usr/bin/env node
/**
 * Rapid Transaction Test - Bypass RPC Rate Limits
 *
 * Tests how many transactions WE can submit per second
 * using WebSocket to avoid Cloudflare HTTP rate limiting.
 *
 * Usage: node rapid-tx-test.mjs <private_key> [count] [value_in_wei]
 */

import { createPublicClient, createWalletClient, http, formatEther, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const PRIVATE_KEY = process.argv[2];
const TX_COUNT = parseInt(process.argv[3] || '50');
const TX_VALUE = BigInt(process.argv[4] || '1'); // 1 wei default

if (!PRIVATE_KEY) {
  console.error('Usage: node rapid-tx-test.mjs <private_key> [tx_count] [value_in_wei]');
  process.exit(1);
}

// Try multiple RPC endpoints
const RPC_ENDPOINTS = [
  'https://carrot.megaeth.com/rpc',
  'https://mainnet.megaeth.com/rpc',
];

const megaeth = {
  id: 4326,
  name: 'MegaETH',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: RPC_ENDPOINTS } },
};

const account = privateKeyToAccount(PRIVATE_KEY);

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║     MegaETH Rapid Transaction Test                        ║');
console.log('║     Testing YOUR max TPS on the network                   ║');
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log();
console.log(`Wallet: ${account.address}`);
console.log(`Planned TXs: ${TX_COUNT}`);
console.log(`Value per TX: ${TX_VALUE} wei ($${(Number(TX_VALUE) * 2950 / 1e18).toFixed(10)})`);
console.log();

async function findWorkingRPC() {
  for (const rpc of RPC_ENDPOINTS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', id: 1 })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.result) {
          console.log(`Using RPC: ${rpc}`);
          return rpc;
        }
      }
    } catch (e) {
      continue;
    }
  }
  throw new Error('No working RPC found');
}

async function main() {
  const rpcUrl = await findWorkingRPC();

  const publicClient = createPublicClient({
    chain: megaeth,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: megaeth,
    transport: http(rpcUrl),
  });

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Balance: ${formatEther(balance)} ETH`);

  const estimatedCost = BigInt(TX_COUNT) * (TX_VALUE + 21000n * 1000000n); // value + gas
  console.log(`Estimated cost: ${formatEther(estimatedCost)} ETH`);

  if (balance < estimatedCost) {
    console.error(`\n⚠️  Warning: Balance may be insufficient for ${TX_COUNT} transactions`);
    console.log(`Proceeding anyway - will stop when balance runs out`);
  }

  // Get starting nonce
  let nonce = await publicClient.getTransactionCount({ address: account.address });
  console.log(`Starting nonce: ${nonce}`);
  console.log();

  // Send transactions as fast as possible
  console.log('🚀 Starting rapid-fire transactions...\n');

  const results = {
    submitted: 0,
    confirmed: 0,
    failed: 0,
    rateLimited: 0,
    hashes: [],
    startTime: Date.now(),
    submitTimes: [],
  };

  const pendingTxs = [];

  // Submit all transactions without waiting for confirmation
  for (let i = 0; i < TX_COUNT; i++) {
    const txStart = Date.now();

    try {
      const hash = await walletClient.sendTransaction({
        to: account.address, // self-transfer
        value: TX_VALUE,
        nonce: nonce + i,
        gas: 21000n,
      });

      const submitTime = Date.now() - txStart;
      results.submitted++;
      results.hashes.push(hash);
      results.submitTimes.push(submitTime);
      pendingTxs.push({ hash, index: i });

      // Progress indicator
      if (results.submitted % 10 === 0 || results.submitted === 1) {
        const elapsed = (Date.now() - results.startTime) / 1000;
        const tps = results.submitted / elapsed;
        process.stdout.write(`\r📤 Submitted: ${results.submitted}/${TX_COUNT} | TPS: ${tps.toFixed(1)} | Last: ${submitTime}ms    `);
      }

    } catch (e) {
      if (e.message?.includes('429') || e.message?.includes('rate limit')) {
        results.rateLimited++;
        console.log(`\n⚠️  Rate limited after ${results.submitted} transactions`);
        break;
      } else if (e.message?.includes('nonce')) {
        // Nonce issue - try to recover
        console.log(`\n⚠️  Nonce issue at TX ${i}, attempting recovery...`);
        nonce = await publicClient.getTransactionCount({ address: account.address });
        i--; // Retry this iteration
        continue;
      } else {
        results.failed++;
        console.log(`\n❌ TX ${i} failed: ${e.shortMessage || e.message?.slice(0, 80)}`);
        if (results.failed > 5) {
          console.log('Too many failures, stopping...');
          break;
        }
      }
    }
  }

  const submitEndTime = Date.now();
  const submitDuration = (submitEndTime - results.startTime) / 1000;

  console.log(`\n\n📊 SUBMISSION RESULTS`);
  console.log('═'.repeat(50));
  console.log(`Submitted: ${results.submitted} transactions`);
  console.log(`Duration: ${submitDuration.toFixed(2)}s`);
  console.log(`Submit TPS: ${(results.submitted / submitDuration).toFixed(2)}`);
  console.log(`Rate Limited: ${results.rateLimited > 0 ? 'YES after ' + results.submitted + ' txs' : 'NO'}`);
  console.log(`Failed: ${results.failed}`);

  if (results.submitTimes.length > 0) {
    const avgSubmit = results.submitTimes.reduce((a, b) => a + b, 0) / results.submitTimes.length;
    const minSubmit = Math.min(...results.submitTimes);
    const maxSubmit = Math.max(...results.submitTimes);
    console.log(`\nSubmit latency: min=${minSubmit}ms, avg=${avgSubmit.toFixed(0)}ms, max=${maxSubmit}ms`);
  }

  // Now wait for confirmations (sample first 5 and last 5)
  if (pendingTxs.length > 0) {
    console.log(`\n⏳ Waiting for confirmations (sampling ${Math.min(10, pendingTxs.length)} txs)...`);

    const samplesToCheck = [
      ...pendingTxs.slice(0, 5),
      ...pendingTxs.slice(-5),
    ].filter((v, i, a) => a.findIndex(t => t.hash === v.hash) === i);

    const confirmTimes = [];

    for (const { hash, index } of samplesToCheck) {
      try {
        const confirmStart = Date.now();
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          timeout: 60000,
          confirmations: 1,
        });
        const confirmTime = Date.now() - confirmStart;
        confirmTimes.push(confirmTime);
        results.confirmed++;
        console.log(`  TX ${index}: confirmed in ${confirmTime}ms (block ${receipt.blockNumber})`);
      } catch (e) {
        console.log(`  TX ${index}: failed to confirm - ${e.message?.slice(0, 50)}`);
      }
    }

    if (confirmTimes.length > 0) {
      const avgConfirm = confirmTimes.reduce((a, b) => a + b, 0) / confirmTimes.length;
      console.log(`\nAvg confirmation wait: ${avgConfirm.toFixed(0)}ms`);
    }
  }

  // Final summary
  console.log(`\n${'═'.repeat(50)}`);
  console.log('📋 FINAL SUMMARY');
  console.log('═'.repeat(50));
  console.log(`Your max submit TPS: ${(results.submitted / submitDuration).toFixed(2)}`);
  console.log(`MegaETH claims: 100,000 TPS`);
  console.log(`Your share: ${((results.submitted / submitDuration) / 100000 * 100).toFixed(4)}% of claimed capacity`);

  if (results.rateLimited > 0) {
    console.log(`\n🚫 RATE LIMITED: You were blocked after ${results.submitted} transactions`);
    console.log(`   This suggests MegaETH restricts regular users while their bots run free.`);
  }

  // Check final balance
  const finalBalance = await publicClient.getBalance({ address: account.address });
  const spent = balance - finalBalance;
  console.log(`\n💰 Spent: ${formatEther(spent)} ETH ($${(Number(spent) * 2950 / 1e18).toFixed(4)})`);
  console.log(`💰 Remaining: ${formatEther(finalBalance)} ETH`);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
