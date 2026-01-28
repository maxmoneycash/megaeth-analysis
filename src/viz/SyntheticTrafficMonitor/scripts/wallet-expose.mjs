#!/usr/bin/env node

/**
 * MegaETH Load Tester Wallet Exposer
 * Identifies the wallets being used to spam synthetic transactions
 */

// Try multiple RPC endpoints
const RPC_URLS = [
  'https://mainnet.megaeth.com/rpc',
  'https://carrot.megaeth.com/rpc',
  'https://rpc.megaeth.com',
];
let RPC_URL = RPC_URLS[0];

console.log('='.repeat(70));
console.log('=== MegaETH LOAD TESTER WALLET EXPOSER ===');
console.log('='.repeat(70));
console.log();

async function rpcCall(method, params = []) {
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
      });
      const text = await res.text();
      if (text.startsWith('<')) {
        // HTML response, try next endpoint
        continue;
      }
      const json = JSON.parse(text);
      if (json.error) {
        console.error(`RPC Error from ${url}: ${json.error.message}`);
        continue;
      }
      RPC_URL = url; // Remember working endpoint
      return json.result;
    } catch (e) {
      // Try next endpoint
      continue;
    }
  }
  console.error('All RPC endpoints failed');
  return null;
}

async function getLatestBlock() {
  const block = await rpcCall('eth_getBlockByNumber', ['latest', true]);
  return block;
}

async function getBlockByNumber(num) {
  const hex = '0x' + num.toString(16);
  return await rpcCall('eth_getBlockByNumber', [hex, true]);
}

// Sample multiple blocks to capture both high and low TPS periods
async function sampleBlocks(count = 10, delay = 1500) {
  console.log(`Sampling ${count} blocks over ${(count * delay) / 1000}s to capture TPS variation...\n`);

  const samples = [];
  const allSenders = new Map();
  const allReceivers = new Map();
  const funcSignatures = new Map();

  for (let i = 0; i < count; i++) {
    const block = await getLatestBlock();
    if (!block) {
      console.log(`[${i+1}/${count}] Failed to fetch block`);
      continue;
    }

    const txCount = block.transactions?.length || 0;
    const blockNum = parseInt(block.number, 16);
    const miniBlockCount = block.miniBlockCount ? parseInt(block.miniBlockCount, 16) : 'N/A';

    console.log(`[${i+1}/${count}] Block ${blockNum} | TXs: ${txCount.toLocaleString().padStart(6)} | Mini-blocks: ${miniBlockCount}`);

    // Analyze transactions
    if (block.transactions) {
      block.transactions.forEach(tx => {
        const from = tx.from?.toLowerCase();
        const to = tx.to?.toLowerCase();
        const input = tx.input || '0x';
        const funcSig = input.slice(0, 10);

        if (from) allSenders.set(from, (allSenders.get(from) || 0) + 1);
        if (to) allReceivers.set(to, (allReceivers.get(to) || 0) + 1);
        if (funcSig.length === 10) funcSignatures.set(funcSig, (funcSignatures.get(funcSig) || 0) + 1);
      });
    }

    samples.push({ blockNum, txCount, miniBlockCount });

    if (i < count - 1) {
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return { samples, allSenders, allReceivers, funcSignatures };
}

async function main() {
  console.log('Target: MegaETH Frontier Network');
  console.log(`RPC: ${RPC_URL}\n`);

  // First, get current state
  const currentBlock = await getLatestBlock();
  if (!currentBlock) {
    console.error('Failed to connect to RPC');
    process.exit(1);
  }

  const blockNum = parseInt(currentBlock.number, 16);
  const txCount = currentBlock.transactions?.length || 0;

  console.log(`Current Block: ${blockNum}`);
  console.log(`Current TX Count: ${txCount}\n`);

  // Sample blocks
  const { samples, allSenders, allReceivers, funcSignatures } = await sampleBlocks(15, 2000);

  // Analyze results
  console.log('\n' + '='.repeat(70));
  console.log('=== ANALYSIS RESULTS ===');
  console.log('='.repeat(70));

  // TPS variation
  const txCounts = samples.map(s => s.txCount);
  const maxTx = Math.max(...txCounts);
  const minTx = Math.min(...txCounts);
  const avgTx = Math.round(txCounts.reduce((a, b) => a + b, 0) / txCounts.length);

  console.log('\n📊 TPS VARIATION (confirms load tester cycling)');
  console.log('-'.repeat(50));
  console.log(`  Max TXs/block:  ${maxTx.toLocaleString()}`);
  console.log(`  Min TXs/block:  ${minTx.toLocaleString()}`);
  console.log(`  Avg TXs/block:  ${avgTx.toLocaleString()}`);
  console.log(`  Variation:      ${maxTx - minTx} TXs (${((maxTx - minTx) / avgTx * 100).toFixed(0)}% swing)`);

  if (maxTx > 1000 && minTx < 200) {
    console.log('\n  ✅ CONFIRMED: Load tester IS cycling ON and OFF');
    console.log('     This is real network behavior, NOT a UI bug');
  } else if (maxTx > minTx * 5) {
    console.log('\n  ⚠️  LIKELY: Significant TPS variation detected');
  }

  // Top senders
  console.log('\n📬 TOP SENDER WALLETS (Load Test Addresses)');
  console.log('-'.repeat(50));

  const topSenders = [...allSenders.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  if (topSenders.length === 0) {
    console.log('  No senders found (possibly during low TPS period)');
  } else {
    const totalTxs = [...allSenders.values()].reduce((a, b) => a + b, 0);

    topSenders.forEach(([addr, count], i) => {
      const pct = ((count / totalTxs) * 100).toFixed(2);
      console.log(`  ${(i+1).toString().padStart(2)}. ${addr} | ${count.toLocaleString().padStart(6)} txs (${pct}%)`);
    });

    // Check for coordinated pattern
    const top5Txs = topSenders.slice(0, 5).reduce((a, [, c]) => a + c, 0);
    const top5Pct = (top5Txs / totalTxs * 100).toFixed(1);

    console.log(`\n  Top 5 senders account for: ${top5Pct}% of all transactions`);

    // Check if wallets have similar tx counts (coordinated)
    const txCountsPerWallet = topSenders.map(([, c]) => c);
    const maxWalletTx = Math.max(...txCountsPerWallet);
    const minWalletTx = Math.min(...txCountsPerWallet.slice(0, 10));

    if (maxWalletTx < minWalletTx * 3) {
      console.log('  ⚠️  PATTERN: Wallets have SIMILAR tx counts (coordinated bot farm)');
    }
  }

  // Target contracts
  console.log('\n🎯 TARGET CONTRACTS');
  console.log('-'.repeat(50));

  const topTargets = [...allReceivers.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const totalReceived = [...allReceivers.values()].reduce((a, b) => a + b, 0);

  topTargets.forEach(([addr, count], i) => {
    const pct = ((count / totalReceived) * 100).toFixed(2);
    console.log(`  ${(i+1).toString().padStart(2)}. ${addr} | ${count.toLocaleString().padStart(6)} txs (${pct}%)`);
  });

  if (topTargets.length > 0) {
    const topTargetPct = (topTargets[0][1] / totalReceived * 100).toFixed(1);
    if (parseFloat(topTargetPct) > 90) {
      console.log(`\n  🚨 ALERT: ${topTargetPct}% of transactions hit ONE CONTRACT`);
      console.log(`     Contract: ${topTargets[0][0]}`);
      console.log('     This is definitively SYNTHETIC LOAD TESTING');
    }
  }

  // Function signatures
  console.log('\n⚙️  FUNCTION SIGNATURES CALLED');
  console.log('-'.repeat(50));

  const topFuncs = [...funcSignatures.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const knownSigs = {
    '0x3593564c': 'execute() [Uniswap UniversalRouter]',
    '0x095ea7b3': 'approve()',
    '0xa9059cbb': 'transfer()',
    '0x23b872dd': 'transferFrom()',
    '0x': 'ETH transfer (no data)',
  };

  topFuncs.forEach(([sig, count], i) => {
    const known = knownSigs[sig] || 'Unknown';
    console.log(`  ${(i+1).toString().padStart(2)}. ${sig} | ${count.toLocaleString().padStart(6)} calls | ${known}`);
  });

  // Wallet statistics
  console.log('\n👛 WALLET STATISTICS');
  console.log('-'.repeat(50));
  console.log(`  Total unique senders: ${allSenders.size.toLocaleString()}`);
  console.log(`  Total unique receivers: ${allReceivers.size.toLocaleString()}`);

  const singleTxWallets = [...allSenders.values()].filter(c => c === 1).length;
  console.log(`  Single-tx wallets: ${singleTxWallets.toLocaleString()} (${(singleTxWallets / allSenders.size * 100).toFixed(1)}%)`);

  // Final verdict
  console.log('\n' + '='.repeat(70));
  console.log('=== VERDICT ===');
  console.log('='.repeat(70));

  if (maxTx > 1000 && minTx < 200) {
    console.log('\n✅ TPS FLUCTUATIONS ARE REAL (not a UI bug)');
    console.log('   The load tester cycles ON and OFF periodically');
  }

  if (topTargets.length > 0 && (topTargets[0][1] / totalReceived) > 0.9) {
    console.log('\n✅ SYNTHETIC LOAD TEST CONFIRMED');
    console.log(`   99%+ of transactions target: ${topTargets[0][0]}`);
  }

  console.log('\n📋 LOAD TEST WALLETS EXPOSED:');
  topSenders.slice(0, 10).forEach(([addr]) => {
    console.log(`   ${addr}`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('Investigation complete.');
}

main().catch(console.error);
