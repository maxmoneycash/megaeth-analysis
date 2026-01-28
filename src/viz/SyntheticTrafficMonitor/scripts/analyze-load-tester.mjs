import WebSocket from 'ws';

const RPC_URL = 'https://carrot.megaeth.com/rpc';
const WS_URL = 'wss://carrot.megaeth.com/ws';

console.log('=== Load Tester Analysis ===\n');

// Track sender addresses and their transaction counts
const senderStats = new Map();
const contractTargets = new Map();
const txPerSecond = [];
let currentSecond = 0;
let txInCurrentSecond = 0;

// Track funding patterns
const walletFirstSeen = new Map();

async function rpcCall(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const json = await res.json();
  return json.result;
}

async function getBlockWithTransactions(blockNum) {
  return await rpcCall('eth_getBlockByNumber', [blockNum === 'latest' ? 'latest' : '0x' + blockNum.toString(16), true]);
}

// Analyze a single block's transactions
function analyzeTransactions(txs, blockNumber) {
  txs.forEach(tx => {
    const from = tx.from?.toLowerCase();
    const to = tx.to?.toLowerCase();

    if (from) {
      senderStats.set(from, (senderStats.get(from) || 0) + 1);
      if (!walletFirstSeen.has(from)) {
        walletFirstSeen.set(from, blockNumber);
      }
    }

    if (to) {
      contractTargets.set(to, (contractTargets.get(to) || 0) + 1);
    }
  });
}

// Stream mini-blocks and track TPS changes in real-time
function streamMiniBlocks() {
  console.log('Connecting to WebSocket to monitor TPS changes...\n');

  const ws = new WebSocket(WS_URL);
  let miniBlockCount = 0;
  let startTime = null;
  let lastReportTime = null;
  let txSinceLastReport = 0;
  let tpsReadings = [];
  let highTPSWallets = new Set();
  let lowTPSWallets = new Set();
  let currentPhase = 'unknown'; // 'high' or 'low'

  ws.on('open', () => {
    console.log('[Connected] Streaming mini-blocks...');
    console.log('Watching for TPS changes to identify load tester patterns\n');

    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_subscribe',
      params: ['miniBlocks']
    }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id) return; // Skip subscription confirmation

    if (msg.method === 'eth_subscription' && msg.params?.result) {
      const mb = msg.params.result;
      const txCount = mb.transactions?.length || 0;
      const now = Date.now();

      if (!startTime) startTime = now;
      if (!lastReportTime) lastReportTime = now;

      miniBlockCount++;
      txSinceLastReport += txCount;

      // Analyze transactions in this mini-block
      if (mb.transactions) {
        mb.transactions.forEach(tx => {
          const from = tx.from?.toLowerCase();
          const to = tx.to?.toLowerCase();

          if (from) {
            senderStats.set(from, (senderStats.get(from) || 0) + 1);
          }
          if (to) {
            contractTargets.set(to, (contractTargets.get(to) || 0) + 1);
          }
        });
      }

      // Report every second
      if (now - lastReportTime >= 1000) {
        const tps = txSinceLastReport;
        tpsReadings.push({ time: now, tps, walletCount: senderStats.size });

        // Detect phase change
        const prevPhase = currentPhase;
        if (tps > 1000) {
          currentPhase = 'high';
          if (prevPhase !== 'high' && prevPhase !== 'unknown') {
            console.log('\n🚀 LOAD TESTER ACTIVATED');
          }
        } else if (tps < 100) {
          currentPhase = 'low';
          if (prevPhase !== 'low' && prevPhase !== 'unknown') {
            console.log('\n⏸️  LOAD TESTER PAUSED');
          }
        }

        const elapsed = Math.floor((now - startTime) / 1000);
        console.log(`[${elapsed}s] TPS: ${tps.toLocaleString().padStart(6)} | Unique wallets: ${senderStats.size.toLocaleString().padStart(6)} | Phase: ${currentPhase.toUpperCase()}`);

        txSinceLastReport = 0;
        lastReportTime = now;
      }

      // After 60 seconds, print summary
      if (miniBlockCount >= 6000) { // ~60 seconds of mini-blocks
        ws.close();
        printSummary(tpsReadings);
      }
    }
  });

  ws.on('error', (err) => console.error('WebSocket error:', err.message));
  ws.on('close', () => {
    console.log('\n[Disconnected]');
    printSummary(tpsReadings);
    process.exit(0);
  });

  // Force close after 65 seconds
  setTimeout(() => {
    ws.close();
  }, 65000);
}

function printSummary(tpsReadings) {
  console.log('\n' + '='.repeat(60));
  console.log('=== LOAD TESTER ANALYSIS SUMMARY ===');
  console.log('='.repeat(60));

  // TPS Statistics
  const tpsValues = tpsReadings.map(r => r.tps);
  const maxTPS = Math.max(...tpsValues);
  const minTPS = Math.min(...tpsValues);
  const avgTPS = tpsValues.reduce((a, b) => a + b, 0) / tpsValues.length;

  console.log('\n📊 TPS Statistics:');
  console.log(`   Max TPS: ${maxTPS.toLocaleString()}`);
  console.log(`   Min TPS: ${minTPS.toLocaleString()}`);
  console.log(`   Avg TPS: ${Math.round(avgTPS).toLocaleString()}`);

  // Identify phases
  const highTPSPeriods = tpsReadings.filter(r => r.tps > 1000).length;
  const lowTPSPeriods = tpsReadings.filter(r => r.tps < 100).length;
  console.log(`\n   High TPS periods (>1K): ${highTPSPeriods} seconds`);
  console.log(`   Low TPS periods (<100): ${lowTPSPeriods} seconds`);

  // Top sender addresses
  console.log('\n📬 Top 20 Sender Addresses (likely load test wallets):');
  const topSenders = [...senderStats.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  topSenders.forEach(([addr, count], i) => {
    console.log(`   ${(i + 1).toString().padStart(2)}. ${addr} - ${count.toLocaleString()} txs`);
  });

  // Target contracts
  console.log('\n🎯 Target Contracts:');
  const topTargets = [...contractTargets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  topTargets.forEach(([addr, count], i) => {
    const percentage = ((count / [...contractTargets.values()].reduce((a, b) => a + b, 0)) * 100).toFixed(2);
    console.log(`   ${(i + 1).toString().padStart(2)}. ${addr} - ${count.toLocaleString()} txs (${percentage}%)`);
  });

  // Wallet statistics
  console.log('\n👛 Wallet Statistics:');
  console.log(`   Total unique wallets: ${senderStats.size.toLocaleString()}`);

  const walletsByTxCount = [...senderStats.entries()];
  const singleTxWallets = walletsByTxCount.filter(([, count]) => count === 1).length;
  const multiTxWallets = walletsByTxCount.filter(([, count]) => count > 1).length;
  const heavyHitters = walletsByTxCount.filter(([, count]) => count > 10).length;

  console.log(`   Single-tx wallets: ${singleTxWallets.toLocaleString()} (${((singleTxWallets / senderStats.size) * 100).toFixed(1)}%)`);
  console.log(`   Multi-tx wallets: ${multiTxWallets.toLocaleString()}`);
  console.log(`   Heavy hitters (>10 tx): ${heavyHitters.toLocaleString()}`);

  // Determine if load tester is cycling
  console.log('\n🔍 CONCLUSION:');
  if (maxTPS > 1000 && minTPS < 100) {
    console.log('   ✓ CONFIRMED: Load tester IS cycling ON and OFF');
    console.log('   - This is NOT a UI bug - it\'s real network behavior');
    console.log(`   - High phase: ~${maxTPS.toLocaleString()} TPS`);
    console.log(`   - Low phase: ~${minTPS} TPS`);
  } else if (maxTPS > 1000) {
    console.log('   → Load tester appears to be CONTINUOUSLY RUNNING');
  } else {
    console.log('   → Load tester appears to be PAUSED during this observation');
  }

  // Check for coordinated wallet pattern
  if (senderStats.size > 1000 && heavyHitters < senderStats.size * 0.01) {
    console.log('\n   📋 PATTERN DETECTED: Coordinated wallet farm');
    console.log('   - Thousands of wallets with similar tx counts');
    console.log('   - Likely auto-generated for load testing');
  }

  console.log('\n' + '='.repeat(60));
}

// Start streaming
streamMiniBlocks();
