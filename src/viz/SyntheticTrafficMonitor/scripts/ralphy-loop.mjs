#!/usr/bin/env node
/**
 * RALPHY LOOP - MegaETH Deep Analysis & Monitoring
 * Continuous research loop for understanding MegaETH traffic patterns
 */

import WebSocket from 'ws';

const WS_URL = 'wss://carrot.megaeth.com/ws';
const RPC_URL = 'https://carrot.megaeth.com/rpc';

// Known addresses from our investigation
const KNOWN_ADDRESSES = {
  // Load tester / Oracle updater wallets (Chainlink Data Streams)
  '0xd8d7235b9315b5b87872b70dd6ad6df65d98c6eb': { label: 'Chainlink Oracle #1', type: 'oracle' },
  '0x20bae013686a00535508c89326fe08853522660b': { label: 'Chainlink Oracle #2', type: 'oracle' },
  '0x8bebc2af464bb7b04570705dd3657543ed54ba9c': { label: 'Chainlink Oracle #3', type: 'oracle' },
  '0x83df6c47e951e310a8defd0642ca8bf9ba2282af': { label: 'Chainlink Oracle #4', type: 'oracle' },

  // System addresses
  '0xdeaddeaddeaddeaddeaddeaddeaddeaddead0001': { label: 'L1 Attributes Depositor', type: 'system' },

  // Known contracts
  '0x9f0b0ae7a3b6671129633121149b7059d004eda4': { label: 'Chainlink Oracle Contract', type: 'oracle-contract' },
  '0x19894fbbcf6f9f937c968b66f10f23c239adb339': { label: 'Distributed Load Tester', type: 'load-test' },
  '0x4200000000000000000000000000000000000015': { label: 'L1Block (OP Stack)', type: 'system' },
};

// Distributed load test contract
const LOAD_TEST_CONTRACT = '0x19894fbbcf6f9f937c968b66f10f23c239adb339';

// Known function selectors
const FUNCTION_SELECTORS = {
  '0x9aec351f': 'updatePrices(uint256,bytes[])', // Oracle price update
  '0xd803a4cf': 'unknown(uint256,bytes)',        // Other contract
};

// Stats tracking
const stats = {
  totalTxs: 0,
  oracleTxs: 0,
  loadTestTxs: 0,
  systemTxs: 0,
  organicTxs: 0,
  byFrom: new Map(),
  byTo: new Map(),
  bySelector: new Map(),
  priceUpdates: [],
  startTime: Date.now(),
};

// Decode price oracle calldata
function decodePriceUpdate(input) {
  if (!input || input.length < 200) return null;

  try {
    const params = input.slice(10);
    const arrayLen = parseInt(params.slice(128, 192), 16);

    const prices = [];
    let pos = 192;

    for (let i = 0; i < arrayLen && pos < params.length; i++) {
      const chunk = params.slice(pos, pos + 128);
      const symbolHex = chunk.slice(0, 64);
      let symbol = '';
      for (let j = 0; j < 64; j += 2) {
        const byte = parseInt(symbolHex.slice(j, j + 2), 16);
        if (byte >= 32 && byte < 127) symbol += String.fromCharCode(byte);
      }
      symbol = symbol.trim();

      const priceHex = chunk.slice(64, 128);
      const price = BigInt('0x' + priceHex);
      const priceFormatted = (Number(price) / 1e8).toFixed(4);

      if (symbol) prices.push({ symbol, price: priceFormatted });
      pos += 128;
    }

    return prices;
  } catch (e) {
    return null;
  }
}

function classifyTransaction(tx) {
  const from = tx.from?.toLowerCase();
  const to = tx.to?.toLowerCase();
  const selector = tx.input?.slice(0, 10);

  const fromInfo = KNOWN_ADDRESSES[from];
  const toInfo = KNOWN_ADDRESSES[to];

  // Chainlink oracle updates
  if (fromInfo?.type === 'oracle' || toInfo?.type === 'oracle-contract') {
    return 'oracle';
  }

  // Distributed load test (high-volume contract)
  if (to === LOAD_TEST_CONTRACT || toInfo?.type === 'load-test') {
    return 'load-test';
  }

  // System transactions
  if (fromInfo?.type === 'system' || toInfo?.type === 'system') {
    return 'system';
  }

  return 'organic';
}

function analyzeMiniBlock(mb) {
  const txs = mb.transactions || [];

  for (const tx of txs) {
    stats.totalTxs++;

    const classification = classifyTransaction(tx);
    const from = tx.from?.toLowerCase();
    const to = tx.to?.toLowerCase();
    const selector = tx.input?.slice(0, 10);

    // Count by classification
    if (classification === 'oracle') stats.oracleTxs++;
    else if (classification === 'load-test') stats.loadTestTxs++;
    else if (classification === 'system') stats.systemTxs++;
    else stats.organicTxs++;

    // Track by address
    stats.byFrom.set(from, (stats.byFrom.get(from) || 0) + 1);
    if (to) stats.byTo.set(to, (stats.byTo.get(to) || 0) + 1);
    if (selector) stats.bySelector.set(selector, (stats.bySelector.get(selector) || 0) + 1);

    // Decode price updates
    if (selector === '0x9aec351f' && stats.priceUpdates.length < 10) {
      const prices = decodePriceUpdate(tx.input);
      if (prices && prices.length > 0) {
        stats.priceUpdates.push({
          timestamp: new Date().toISOString(),
          prices
        });
      }
    }
  }
}

function printReport() {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const tps = stats.totalTxs / elapsed;

  console.clear();
  console.log('═'.repeat(80));
  console.log('  RALPHY LOOP - MegaETH Traffic Analysis');
  console.log('═'.repeat(80));
  console.log(`  Runtime: ${elapsed.toFixed(0)}s | TPS: ${tps.toFixed(1)}`);
  console.log('');

  // Traffic breakdown
  console.log('┌─ TRAFFIC BREAKDOWN ─────────────────────────────────────────┐');
  const loadTestPct = ((stats.loadTestTxs / stats.totalTxs) * 100 || 0).toFixed(1);
  const oraclePct = ((stats.oracleTxs / stats.totalTxs) * 100 || 0).toFixed(1);
  const systemPct = ((stats.systemTxs / stats.totalTxs) * 100 || 0).toFixed(1);
  const organicPct = ((stats.organicTxs / stats.totalTxs) * 100 || 0).toFixed(1);
  const syntheticPct = ((stats.loadTestTxs + stats.oracleTxs) / stats.totalTxs * 100 || 0).toFixed(1);

  console.log(`  Load Test TXs:   ${stats.loadTestTxs.toLocaleString().padStart(10)} (${loadTestPct}%) ⚠️`);
  console.log(`  Oracle Updates:  ${stats.oracleTxs.toLocaleString().padStart(10)} (${oraclePct}%)`);
  console.log(`  System TXs:      ${stats.systemTxs.toLocaleString().padStart(10)} (${systemPct}%)`);
  console.log(`  Organic TXs:     ${stats.organicTxs.toLocaleString().padStart(10)} (${organicPct}%)`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  TOTAL:           ${stats.totalTxs.toLocaleString().padStart(10)}`);
  console.log(`  SYNTHETIC:       ${(stats.loadTestTxs + stats.oracleTxs).toLocaleString().padStart(10)} (${syntheticPct}%) ⚠️`);
  console.log('└─────────────────────────────────────────────────────────────┘');
  console.log('');

  // Top senders
  console.log('┌─ TOP SENDERS ───────────────────────────────────────────────┐');
  const topFrom = [...stats.byFrom.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [addr, count] of topFrom) {
    const info = KNOWN_ADDRESSES[addr];
    const label = info ? ` (${info.label})` : '';
    const pct = ((count / stats.totalTxs) * 100).toFixed(1);
    console.log(`  ${addr.slice(0, 18)}...  ${count.toLocaleString().padStart(8)}  ${pct}%${label}`);
  }
  console.log('└─────────────────────────────────────────────────────────────┘');
  console.log('');

  // Top contracts
  console.log('┌─ TOP CONTRACTS CALLED ──────────────────────────────────────┐');
  const topTo = [...stats.byTo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [addr, count] of topTo) {
    const info = KNOWN_ADDRESSES[addr];
    const label = info ? ` (${info.label})` : '';
    const pct = ((count / stats.totalTxs) * 100).toFixed(1);
    console.log(`  ${addr.slice(0, 18)}...  ${count.toLocaleString().padStart(8)}  ${pct}%${label}`);
  }
  console.log('└─────────────────────────────────────────────────────────────┘');
  console.log('');

  // Function selectors
  console.log('┌─ TOP FUNCTION SELECTORS ────────────────────────────────────┐');
  const topSel = [...stats.bySelector.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [sel, count] of topSel) {
    const name = FUNCTION_SELECTORS[sel] || 'unknown';
    const pct = ((count / stats.totalTxs) * 100).toFixed(1);
    console.log(`  ${sel}  ${name.padEnd(30)}  ${count.toLocaleString().padStart(8)}  ${pct}%`);
  }
  console.log('└─────────────────────────────────────────────────────────────┘');
  console.log('');

  // Latest prices
  if (stats.priceUpdates.length > 0) {
    const latest = stats.priceUpdates[stats.priceUpdates.length - 1];
    console.log('┌─ LATEST ORACLE PRICES ─────────────────────────────────────┐');
    for (const p of latest.prices) {
      console.log(`  ${p.symbol.padEnd(6)}: $${p.price}`);
    }
    console.log('└─────────────────────────────────────────────────────────────┘');
  }

  console.log('');
  console.log('Press Ctrl+C to stop and see final report');
}

async function main() {
  console.log('🔄 RALPHY LOOP - Starting MegaETH Deep Analysis...\n');

  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('✓ Connected to MegaETH WebSocket');
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_subscribe',
      params: ['miniBlocks']
    }));
    stats.startTime = Date.now();
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.id === 1 && msg.result) {
        console.log('✓ Subscribed to mini-blocks\n');
        // Start report interval
        setInterval(printReport, 2000);
      }

      if (msg.method === 'eth_subscription' && msg.params?.result) {
        analyzeMiniBlock(msg.params.result);
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    console.log('\n\n═══════════════════════════════════════════════════════════════');
    console.log('FINAL REPORT');
    console.log('═══════════════════════════════════════════════════════════════');
    printReport();

    // Export data
    console.log('\n\nExporting data to ralphy-data.json...');
    const exportData = {
      runtime: (Date.now() - stats.startTime) / 1000,
      totals: {
        total: stats.totalTxs,
        oracle: stats.oracleTxs,
        system: stats.systemTxs,
        organic: stats.organicTxs,
      },
      topSenders: [...stats.byFrom.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
      topContracts: [...stats.byTo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
      functionSelectors: [...stats.bySelector.entries()].sort((a, b) => b[1] - a[1]),
      priceUpdates: stats.priceUpdates,
    };

    require('fs').writeFileSync('ralphy-data.json', JSON.stringify(exportData, null, 2));
    console.log('Done!');

    process.exit(0);
  });

  ws.on('error', (err) => console.error('WebSocket error:', err.message));

  process.on('SIGINT', () => {
    console.log('\n\nStopping...');
    ws.close();
  });
}

main().catch(console.error);
