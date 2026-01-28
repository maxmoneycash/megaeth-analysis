#!/usr/bin/env node
/**
 * Check if TPS drops correlate with failures or empty blocks
 */

const RPC_URL = 'https://mainnet.megaeth.com/rpc';

async function rpcCall(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const text = await res.text();
  if (text.startsWith('<')) return null;
  return JSON.parse(text).result;
}

async function main() {
  console.log('=== Checking for congestion evidence ===\n');

  // Get recent blocks
  const latest = await rpcCall('eth_blockNumber');
  const latestNum = parseInt(latest, 16);
  console.log(`Current block: ${latestNum}\n`);

  // Sample blocks and check for patterns
  const samples = [];
  let emptyCount = 0;
  let lowTxCount = 0;
  let highTxCount = 0;

  console.log('Sampling last 50 blocks...\n');

  for (let i = 0; i < 50; i++) {
    const blockNum = latestNum - i;
    const block = await rpcCall('eth_getBlockByNumber', ['0x' + blockNum.toString(16), false]);
    if (!block) continue;

    const txCount = block.transactions?.length || 0;
    const gasUsed = parseInt(block.gasUsed || '0x0', 16);
    const gasLimit = parseInt(block.gasLimit || '0x0', 16);
    const utilization = gasLimit > 0 ? (gasUsed / gasLimit * 100).toFixed(1) : 0;

    if (txCount === 0) emptyCount++;
    else if (txCount < 1000) lowTxCount++;
    else highTxCount++;

    samples.push({ blockNum, txCount, gasUsed, utilization });

    // Log interesting blocks
    if (txCount < 100) {
      console.log(`Block ${blockNum}: ${txCount} txs (${utilization}% gas) - LOW!`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Empty blocks (0 tx): ${emptyCount}`);
  console.log(`Low tx blocks (<1K): ${lowTxCount}`);
  console.log(`High tx blocks (>1K): ${highTxCount}`);

  // Check for sudden transitions
  console.log('\n=== TPS Transitions ===');
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i-1].txCount;
    const curr = samples[i].txCount;
    const diff = Math.abs(prev - curr);

    if (diff > 5000) {
      console.log(`Block ${samples[i].blockNum}: ${curr} → ${prev} txs (${diff > 0 ? '+' : ''}${prev - curr} change)`);
    }
  }

  // Conclusion
  console.log('\n=== Analysis ===');
  if (emptyCount > 5) {
    console.log('⚠️  Multiple empty blocks found - suggests infrastructure issues');
  }
  if (lowTxCount > highTxCount) {
    console.log('⚠️  More low-tx blocks than high-tx - load tester may be off');
  } else {
    console.log('✓ Load tester appears active (mostly high-tx blocks)');
  }
}

main().catch(console.error);
