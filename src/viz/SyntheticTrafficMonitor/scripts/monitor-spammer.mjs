#!/usr/bin/env node
/**
 * Real-time TPS monitor to catch load tester spikes
 */

import WebSocket from 'ws';

const WS_URL = 'wss://carrot.megaeth.com/ws';

// Track per-second metrics
let currentSecond = Math.floor(Date.now() / 1000);
let txThisSecond = 0;
let addressesThisSecond = new Map();

// Track high TPS periods
const highTPSSnapshots = [];
let peakTPS = 0;

// Overall tracking
const allAddresses = new Map();
const allContracts = new Map();
let totalTx = 0;

function recordTx(tx) {
  const from = tx.from?.toLowerCase();
  const to = tx.to?.toLowerCase();

  if (from) {
    txThisSecond++;
    addressesThisSecond.set(from, (addressesThisSecond.get(from) || 0) + 1);
    allAddresses.set(from, (allAddresses.get(from) || 0) + 1);
  }
  if (to) {
    allContracts.set(to, (allContracts.get(to) || 0) + 1);
  }
  totalTx++;
}

function checkSecond() {
  const now = Math.floor(Date.now() / 1000);
  if (now > currentSecond) {
    const tps = txThisSecond;

    if (tps > peakTPS) {
      peakTPS = tps;
    }

    // Log status
    const elapsed = now - startSecond;
    const avgTPS = totalTx / elapsed;

    let status = '';
    if (tps > 5000) status = ' 🔥🔥🔥 MASSIVE SPIKE!';
    else if (tps > 1000) status = ' 🔥🔥 HIGH TPS!';
    else if (tps > 500) status = ' 🔥 Elevated';

    process.stdout.write(`\r[${elapsed}s] TPS: ${tps.toString().padStart(5)} | Peak: ${peakTPS.toString().padStart(5)} | Avg: ${avgTPS.toFixed(0).padStart(5)} | Senders: ${allAddresses.size}${status}   `);

    // Capture high TPS snapshots
    if (tps > 500) {
      const snapshot = {
        time: new Date().toISOString(),
        tps,
        addresses: [...addressesThisSecond.entries()].sort((a,b) => b[1] - a[1]).slice(0, 10)
      };
      highTPSSnapshots.push(snapshot);

      console.log(`\n\n📊 HIGH TPS SNAPSHOT (${tps} TPS):`);
      console.log('Top senders this second:');
      snapshot.addresses.forEach(([addr, count], i) => {
        console.log(`  ${i+1}. ${addr}: ${count} txs`);
      });
      console.log('');
    }

    // Reset for next second
    currentSecond = now;
    txThisSecond = 0;
    addressesThisSecond.clear();
  }
}

let startSecond;

async function main() {
  const MONITOR_TIME = parseInt(process.argv[2]) || 300; // Default 5 minutes

  console.log('🔍 MegaETH Load Tester Real-time Monitor');
  console.log(`Monitoring for ${MONITOR_TIME} seconds to catch TPS spikes...`);
  console.log('Will capture wallet addresses during high TPS periods.\n');

  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('✓ Connected to MegaETH WebSocket');
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_subscribe',
      params: ['miniBlocks']
    }));
    startSecond = Math.floor(Date.now() / 1000);
    currentSecond = startSecond;
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.id === 1 && msg.result) {
        console.log('✓ Subscribed, watching for TPS spikes...\n');
      }

      if (msg.method === 'eth_subscription' && msg.params?.result) {
        const mb = msg.params.result;
        const txs = mb.transactions || [];
        txs.forEach(tx => recordTx(tx));
        checkSecond();
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    console.log('\n\n' + '='.repeat(80));
    console.log('MONITORING COMPLETE');
    console.log('='.repeat(80));

    console.log(`\nPeak TPS observed: ${peakTPS}`);
    console.log(`Total transactions: ${totalTx}`);
    console.log(`Unique senders: ${allAddresses.size}`);

    if (highTPSSnapshots.length > 0) {
      console.log(`\nHigh TPS events captured: ${highTPSSnapshots.length}`);

      // Aggregate addresses from high TPS periods
      const highTPSAddresses = new Map();
      highTPSSnapshots.forEach(s => {
        s.addresses.forEach(([addr, count]) => {
          highTPSAddresses.set(addr, (highTPSAddresses.get(addr) || 0) + count);
        });
      });

      console.log('\n🔴 TOP LOAD TESTER WALLETS (from high TPS periods):');
      console.log('-'.repeat(60));
      [...highTPSAddresses.entries()]
        .sort((a,b) => b[1] - a[1])
        .slice(0, 15)
        .forEach(([addr, count], i) => {
          console.log(`${(i+1).toString().padStart(2)}. ${addr}: ${count} txs`);
        });
    } else {
      console.log('\n⚠️  No high TPS events captured during monitoring period.');
      console.log('The load tester may be OFF. Top overall senders:');
      console.log('-'.repeat(60));
      [...allAddresses.entries()]
        .sort((a,b) => b[1] - a[1])
        .slice(0, 15)
        .forEach(([addr, count], i) => {
          console.log(`${(i+1).toString().padStart(2)}. ${addr}: ${count} txs`);
        });
    }

    console.log('\n📋 TOP CONTRACTS BEING CALLED:');
    console.log('-'.repeat(60));
    [...allContracts.entries()]
      .sort((a,b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([addr, count], i) => {
        console.log(`${(i+1).toString().padStart(2)}. ${addr}: ${count} calls`);
      });

    process.exit(0);
  });

  ws.on('error', (err) => console.error('WebSocket error:', err.message));

  setTimeout(() => {
    console.log('\n\n⏱️  Monitoring period complete');
    ws.close();
  }, MONITOR_TIME * 1000);

  process.on('SIGINT', () => {
    console.log('\n\n⏹️  Stopping...');
    ws.close();
  });
}

main().catch(console.error);
