#!/usr/bin/env node
/**
 * MegaETH Load Tester Spammer Analysis
 * Identifies wallet addresses responsible for synthetic TPS load
 */

import WebSocket from 'ws';

const WS_URL = 'wss://carrot.megaeth.com/ws';
const RPC_URL = 'https://carrot.megaeth.com/rpc';

// Track addresses
const fromAddresses = new Map(); // from address -> { count, totalGas, firstSeen, lastSeen }
const toAddresses = new Map();   // to address -> { count, callers: Set }
const txHashes = [];
let totalTxCount = 0;
let totalMiniBlocks = 0;
let startTime = Date.now();

// Stats by time window
const timeWindows = [];
let currentWindow = { start: Date.now(), txs: 0, addresses: new Set() };

// High TPS detection
let highTPSPeriods = [];
let currentHighPeriod = null;

function analyzeTransaction(tx, miniBlockNumber) {
  const from = tx.from?.toLowerCase();
  const to = tx.to?.toLowerCase();
  const hash = tx.hash;
  const gas = parseInt(tx.gas || '0', 16);

  if (from) {
    if (!fromAddresses.has(from)) {
      fromAddresses.set(from, {
        count: 0,
        totalGas: 0,
        firstSeen: miniBlockNumber,
        lastSeen: miniBlockNumber,
        hashes: []
      });
    }
    const entry = fromAddresses.get(from);
    entry.count++;
    entry.totalGas += gas;
    entry.lastSeen = miniBlockNumber;
    if (entry.hashes.length < 5) entry.hashes.push(hash); // Keep sample hashes
  }

  if (to) {
    if (!toAddresses.has(to)) {
      toAddresses.set(to, { count: 0, callers: new Set() });
    }
    const entry = toAddresses.get(to);
    entry.count++;
    if (from) entry.callers.add(from);
  }

  // Track in current time window
  currentWindow.txs++;
  if (from) currentWindow.addresses.add(from);

  totalTxCount++;
  if (txHashes.length < 100) txHashes.push(hash);
}

function rotateTimeWindow() {
  if (currentWindow.txs > 0) {
    const duration = (Date.now() - currentWindow.start) / 1000;
    const tps = currentWindow.txs / duration;

    timeWindows.push({
      ...currentWindow,
      addresses: currentWindow.addresses.size,
      duration: duration,
      tps: tps
    });

    // Track high TPS periods
    if (tps > 500) {
      if (!currentHighPeriod) {
        currentHighPeriod = { start: currentWindow.start, txs: 0, addresses: new Set() };
      }
      currentHighPeriod.txs += currentWindow.txs;
      currentWindow.addresses.forEach(a => currentHighPeriod.addresses.add(a));
    } else if (currentHighPeriod) {
      highTPSPeriods.push({
        ...currentHighPeriod,
        addresses: currentHighPeriod.addresses.size,
        end: Date.now()
      });
      currentHighPeriod = null;
    }
  }
  currentWindow = { start: Date.now(), txs: 0, addresses: new Set() };
}

function printReport() {
  console.log('\n' + '='.repeat(80));
  console.log('MEGAETH LOAD TESTER ANALYSIS REPORT');
  console.log('='.repeat(80));

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nCollection period: ${elapsed.toFixed(1)} seconds`);
  console.log(`Total mini-blocks analyzed: ${totalMiniBlocks}`);
  console.log(`Total transactions: ${totalTxCount}`);
  console.log(`Average TPS: ${(totalTxCount / elapsed).toFixed(1)}`);
  console.log(`Unique FROM addresses: ${fromAddresses.size}`);
  console.log(`Unique TO addresses: ${toAddresses.size}`);

  // Top FROM addresses (likely spammers)
  console.log('\n' + '-'.repeat(80));
  console.log('TOP TRANSACTION SENDERS (Likely Load Tester Wallets)');
  console.log('-'.repeat(80));

  const sortedFrom = [...fromAddresses.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);

  console.log('\nRank | Address                                    | TX Count | % of Total | Gas Used');
  console.log('-'.repeat(95));

  sortedFrom.forEach(([addr, data], i) => {
    const pct = ((data.count / totalTxCount) * 100).toFixed(2);
    const gasM = (data.totalGas / 1e6).toFixed(1);
    console.log(`${(i+1).toString().padStart(4)} | ${addr} | ${data.count.toString().padStart(8)} | ${pct.padStart(9)}% | ${gasM}M`);
  });

  // Check if top addresses are dominating (sign of synthetic load)
  if (sortedFrom.length > 0) {
    const topAddress = sortedFrom[0];
    const topPct = (topAddress[1].count / totalTxCount) * 100;
    const top5Pct = sortedFrom.slice(0, 5).reduce((sum, [, d]) => sum + d.count, 0) / totalTxCount * 100;
    const top10Pct = sortedFrom.slice(0, 10).reduce((sum, [, d]) => sum + d.count, 0) / totalTxCount * 100;

    console.log('\n' + '-'.repeat(80));
    console.log('CONCENTRATION ANALYSIS');
    console.log('-'.repeat(80));
    console.log(`Top 1 address: ${topPct.toFixed(2)}% of all transactions`);
    console.log(`Top 5 addresses: ${top5Pct.toFixed(2)}% of all transactions`);
    console.log(`Top 10 addresses: ${top10Pct.toFixed(2)}% of all transactions`);

    if (top5Pct > 80) {
      console.log('\n⚠️  HIGHLY CONCENTRATED - Clear sign of synthetic load testing');
    } else if (top5Pct > 50) {
      console.log('\n⚠️  MODERATELY CONCENTRATED - Possible synthetic load');
    }
  }

  // Top TO addresses (contracts being called)
  console.log('\n' + '-'.repeat(80));
  console.log('TOP DESTINATION CONTRACTS');
  console.log('-'.repeat(80));

  const sortedTo = [...toAddresses.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  console.log('\nRank | Contract Address                           | Calls    | Unique Callers');
  console.log('-'.repeat(85));

  sortedTo.forEach(([addr, data], i) => {
    console.log(`${(i+1).toString().padStart(4)} | ${addr || 'null (contract creation)'} | ${data.count.toString().padStart(8)} | ${data.callers.size}`);
  });

  // Sample transaction hashes for verification
  if (sortedFrom.length > 0 && sortedFrom[0][1].hashes.length > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log('SAMPLE TRANSACTION HASHES (from top sender)');
    console.log('-'.repeat(80));
    sortedFrom[0][1].hashes.forEach(h => console.log(h));
    console.log('\nVerify at: https://megaexplorer.xyz/tx/<hash>');
  }

  // Time-based analysis
  if (timeWindows.length > 1) {
    console.log('\n' + '-'.repeat(80));
    console.log('TIME WINDOW ANALYSIS (5-second windows)');
    console.log('-'.repeat(80));

    timeWindows.slice(-20).forEach((w, i) => {
      console.log(`Window ${i+1}: ${w.txs.toString().padStart(6)} txs, ${w.addresses.toString().padStart(3)} senders, ${w.tps.toFixed(0).padStart(6)} TPS`);
    });

    // Calculate TPS variance
    const tpsValues = timeWindows.map(w => w.tps);
    const maxTPS = Math.max(...tpsValues);
    const minTPS = Math.min(...tpsValues);
    const avgTPS = tpsValues.reduce((a, b) => a + b, 0) / tpsValues.length;

    console.log('\nTPS Statistics:');
    console.log(`  Min TPS: ${minTPS.toFixed(0)}`);
    console.log(`  Max TPS: ${maxTPS.toFixed(0)}`);
    console.log(`  Avg TPS: ${avgTPS.toFixed(0)}`);
    console.log(`  Variance: ${(maxTPS - minTPS).toFixed(0)} (Max - Min)`);

    if (maxTPS > 1000 && minTPS < 100) {
      console.log('\n⚠️  HIGH VARIANCE DETECTED - Load tester cycles ON/OFF');
    }
  }

  // JSON export for further analysis
  console.log('\n' + '-'.repeat(80));
  console.log('JSON EXPORT (Top 10 Spammer Addresses)');
  console.log('-'.repeat(80));
  const exportData = sortedFrom.slice(0, 10).map(([addr, data]) => ({
    address: addr,
    txCount: data.count,
    percentOfTotal: ((data.count / totalTxCount) * 100).toFixed(2) + '%',
    sampleHashes: data.hashes
  }));
  console.log(JSON.stringify(exportData, null, 2));
}

async function main() {
  const COLLECT_TIME = parseInt(process.argv[2]) || 90; // Default 90 seconds

  console.log('🔍 MegaETH Load Tester Spammer Analysis');
  console.log(`Will collect data for ${COLLECT_TIME} seconds to catch TPS fluctuations...`);
  console.log('Connecting to WebSocket...\n');

  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('✓ Connected to MegaETH WebSocket');
    console.log('Subscribing to mini-blocks...');

    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_subscribe',
      params: ['miniBlocks']
    }));

    startTime = Date.now();
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.id === 1 && msg.result) {
        console.log(`✓ Subscribed with ID: ${msg.result}`);
        console.log(`\nCollecting transaction data for ${COLLECT_TIME} seconds...\n`);
      }

      if (msg.method === 'eth_subscription' && msg.params?.result) {
        const mb = msg.params.result;
        totalMiniBlocks++;

        const txCount = mb.transactions?.length || 0;
        if (txCount > 0) {
          mb.transactions.forEach(tx => analyzeTransaction(tx, mb.number));
        }

        // Rotate time window every 5 seconds
        if (Date.now() - currentWindow.start > 5000) {
          const tps = currentWindow.txs / ((Date.now() - currentWindow.start) / 1000);
          process.stdout.write(`\r[${((Date.now() - startTime)/1000).toFixed(0)}s] Mini-blocks: ${totalMiniBlocks} | TXs: ${totalTxCount} | TPS: ${tps.toFixed(0)} | Senders: ${fromAddresses.size}   `);
          rotateTimeWindow();
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  });

  ws.on('error', (err) => {
    console.error('\nWebSocket error:', err.message);
  });

  ws.on('close', () => {
    console.log('\n\nWebSocket closed');
    rotateTimeWindow();
    printReport();
    process.exit(0);
  });

  // Auto-stop after COLLECT_TIME seconds
  setTimeout(() => {
    console.log('\n\n⏱️  Collection period complete');
    ws.close();
  }, COLLECT_TIME * 1000);

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n\n⏹️  Stopping collection...');
    ws.close();
  });
}

main().catch(console.error);
