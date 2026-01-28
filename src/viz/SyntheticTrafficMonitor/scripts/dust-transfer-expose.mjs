#!/usr/bin/env node

/**
 * Analyze the "other" 62% of traffic that isn't DEX swaps
 * Looking for 3-wei dust transfers and other synthetic patterns
 */

const RPC_URLS = [
  'https://mainnet.megaeth.com/rpc',
  'https://carrot.megaeth.com/rpc',
  'https://rpc.megaeth.com',
];

async function rpcCall(method, params = []) {
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of RPC_URLS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
        });
        const text = await res.text();
        if (text.startsWith('<')) continue;
        const json = JSON.parse(text);
        if (json.result) return json.result;
      } catch (e) {
        continue;
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('All RPC endpoints failed');
}

console.log('='.repeat(70));
console.log('=== DUST TRANSFER & SYNTHETIC TRAFFIC ANALYSIS ===');
console.log('='.repeat(70));
console.log();

async function main() {
  // Get latest block with full tx data
  const block = await rpcCall('eth_getBlockByNumber', ['latest', true]);
  const txCount = block.transactions.length;

  console.log(`Block: ${parseInt(block.number, 16)}`);
  console.log(`Total TXs: ${txCount.toLocaleString()}\n`);

  // Categorize transactions
  const DEX_ROUTER = '0xaab1c664cead881afbb58555e6a3a79523d3e4c0';
  const categories = {
    dexSwaps: [],
    dustTransfers: [],     // Very small value transfers
    zeroValueCalls: [],    // Contract calls with 0 value
    normalTxs: [],
    other: []
  };

  const valueDistribution = new Map();
  const inputLengths = new Map();

  block.transactions.forEach(tx => {
    const to = tx.to?.toLowerCase();
    const value = BigInt(tx.value || '0x0');
    const input = tx.input || '0x';
    const inputLen = input.length;

    // Track value distribution
    const valueStr = value.toString();
    valueDistribution.set(valueStr, (valueDistribution.get(valueStr) || 0) + 1);

    // Track input data lengths
    inputLengths.set(inputLen, (inputLengths.get(inputLen) || 0) + 1);

    // Categorize
    if (to === DEX_ROUTER) {
      categories.dexSwaps.push(tx);
    } else if (value > 0n && value <= 1000n) {
      // Dust transfer: 1-1000 wei
      categories.dustTransfers.push(tx);
    } else if (value === 0n && input !== '0x') {
      // Contract call with 0 value
      categories.zeroValueCalls.push(tx);
    } else if (value > 1000n) {
      categories.normalTxs.push(tx);
    } else {
      categories.other.push(tx);
    }
  });

  // Print results
  console.log('📊 TRANSACTION CATEGORIES');
  console.log('-'.repeat(50));
  Object.entries(categories).forEach(([cat, txs]) => {
    const pct = ((txs.length / txCount) * 100).toFixed(2);
    console.log(`  ${cat.padEnd(18)}: ${txs.length.toLocaleString().padStart(6)} (${pct}%)`);
  });

  // Value distribution
  console.log('\n💰 TOP VALUE AMOUNTS (reveals synthetic patterns)');
  console.log('-'.repeat(50));

  const topValues = [...valueDistribution.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  topValues.forEach(([value, count], i) => {
    const pct = ((count / txCount) * 100).toFixed(2);
    const valBigInt = BigInt(value);
    let humanValue;
    if (valBigInt === 0n) {
      humanValue = '0 wei';
    } else if (valBigInt < 1000n) {
      humanValue = `${valBigInt} wei`;
    } else if (valBigInt < 1000000000n) {
      humanValue = `${valBigInt} wei`;
    } else if (valBigInt < 1000000000000000000n) {
      humanValue = `${(Number(valBigInt) / 1e9).toFixed(4)} gwei`;
    } else {
      humanValue = `${(Number(valBigInt) / 1e18).toFixed(6)} ETH`;
    }
    console.log(`  ${(i+1).toString().padStart(2)}. ${value.padStart(25)} (${humanValue}) | ${count.toLocaleString().padStart(6)} txs (${pct}%)`);
  });

  // Check for 3-wei specifically
  const threeWei = valueDistribution.get('3') || 0;
  if (threeWei > 100) {
    console.log(`\n  🚨 ALERT: Found ${threeWei.toLocaleString()} transactions with EXACTLY 3 wei`);
    console.log('     This is the SIGNATURE of automated synthetic load testing');
  }

  // Input data lengths
  console.log('\n📝 INPUT DATA LENGTH DISTRIBUTION');
  console.log('-'.repeat(50));

  const topInputLens = [...inputLengths.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  topInputLens.forEach(([len, count], i) => {
    const pct = ((count / txCount) * 100).toFixed(2);
    const description = len === 2 ? '(ETH transfer, no data)' :
                        len > 100 ? '(contract call)' : '';
    console.log(`  ${(i+1).toString().padStart(2)}. ${len} bytes | ${count.toLocaleString().padStart(6)} txs (${pct}%) ${description}`);
  });

  // Analyze dust transfer targets
  if (categories.dustTransfers.length > 0) {
    console.log('\n🧹 DUST TRANSFER ANALYSIS');
    console.log('-'.repeat(50));

    const dustTargets = new Map();
    const dustSenders = new Map();

    categories.dustTransfers.forEach(tx => {
      const to = tx.to?.toLowerCase();
      const from = tx.from?.toLowerCase();
      if (to) dustTargets.set(to, (dustTargets.get(to) || 0) + 1);
      if (from) dustSenders.set(from, (dustSenders.get(from) || 0) + 1);
    });

    console.log(`  Unique dust senders: ${dustSenders.size.toLocaleString()}`);
    console.log(`  Unique dust targets: ${dustTargets.size.toLocaleString()}`);

    // Check if senders == targets (self-spam pattern)
    let selfSpam = 0;
    categories.dustTransfers.forEach(tx => {
      if (tx.from?.toLowerCase() === tx.to?.toLowerCase()) selfSpam++;
    });

    if (selfSpam > 0) {
      console.log(`  Self-transfers: ${selfSpam.toLocaleString()} (wallets sending to themselves)`);
    }

    // Check pattern: are wallets sending to each other in sequence?
    const topDustSenders = [...dustSenders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log('\n  Top dust senders:');
    topDustSenders.forEach(([addr, count], i) => {
      console.log(`    ${i+1}. ${addr} | ${count} dust txs`);
    });
  }

  // Final analysis
  console.log('\n' + '='.repeat(70));
  console.log('=== SYNTHETIC TRAFFIC BREAKDOWN ===');
  console.log('='.repeat(70));

  const syntheticTotal = categories.dexSwaps.length + categories.dustTransfers.length;
  const syntheticPct = ((syntheticTotal / txCount) * 100).toFixed(1);

  console.log(`\n  DEX Swap Spam:     ${categories.dexSwaps.length.toLocaleString().padStart(6)} (${((categories.dexSwaps.length/txCount)*100).toFixed(1)}%)`);
  console.log(`  Dust Transfers:    ${categories.dustTransfers.length.toLocaleString().padStart(6)} (${((categories.dustTransfers.length/txCount)*100).toFixed(1)}%)`);
  console.log(`  ──────────────────────────────`);
  console.log(`  TOTAL SYNTHETIC:   ${syntheticTotal.toLocaleString().padStart(6)} (${syntheticPct}%)`);
  console.log(`  Organic:           ${categories.normalTxs.length.toLocaleString().padStart(6)} (${((categories.normalTxs.length/txCount)*100).toFixed(1)}%)`);

  console.log('\n' + '='.repeat(70));
}

main().catch(console.error);
