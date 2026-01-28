#!/usr/bin/env node
/**
 * MegaETH Stats WebSocket Client
 *
 * Reverse engineered from stress.megaeth.com
 *
 * Key Discovery:
 *   WebSocket URL: wss://mainnet-dashboard.megaeth.com/metrics
 *   Provides: historical_tps_24h, chain stats, and live TPS data
 *
 * Usage:
 *   node megaeth-stats-websocket.mjs              # Listen and dump data
 *   node megaeth-stats-websocket.mjs --continuous # Continuous monitoring
 *   node megaeth-stats-websocket.mjs --raw        # Raw JSON output
 */

import WebSocket from 'ws';
import { writeFileSync } from 'fs';

const WS_URL = 'wss://mainnet-dashboard.megaeth.com/metrics';

// =============================================================================
// WEBSOCKET CLIENT
// =============================================================================
class MegaETHStatsClient {
  constructor(options = {}) {
    this.ws = null;
    this.options = options;
    this.messageCount = 0;
    this.data = null;
    this.reconnectAttempts = 0;
    this.maxReconnects = 5;
    this.pingInterval = null;
  }

  connect() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     MegaETH Stats WebSocket - Reverse Engineered           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\nConnecting to: ${WS_URL}\n`);

    this.ws = new WebSocket(WS_URL);

    this.ws.on('open', () => {
      console.log('✅ Connected to MegaETH dashboard WebSocket');
      this.reconnectAttempts = 0;

      // Send keepalive pings every 30 seconds (like the official client)
      this.pingInterval = setInterval(() => {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    });

    this.ws.on('message', (data) => {
      this.messageCount++;
      try {
        const parsed = JSON.parse(data.toString());
        this.data = parsed;

        if (this.options.raw) {
          console.log(JSON.stringify(parsed, null, 2));
        } else {
          this.displayStats(parsed);
        }

        // Save the data
        if (parsed.data) {
          writeFileSync(
            './ralphy-output/megaeth-live-stats.json',
            JSON.stringify(parsed, null, 2)
          );
        }
      } catch (e) {
        console.error('Parse error:', e.message);
      }
    });

    this.ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
    });

    this.ws.on('close', () => {
      console.log('🔌 Connection closed');
      clearInterval(this.pingInterval);

      if (this.options.continuous && this.reconnectAttempts < this.maxReconnects) {
        this.reconnectAttempts++;
        console.log(`Reconnecting in 2s (attempt ${this.reconnectAttempts}/${this.maxReconnects})...`);
        setTimeout(() => this.connect(), 2000);
      }
    });
  }

  displayStats(msg) {
    console.log('\n' + '─'.repeat(60));
    console.log(`📊 Message #${this.messageCount} received at ${new Date().toISOString()}`);
    console.log('─'.repeat(60));

    if (!msg.data) {
      console.log('No data field in message');
      return;
    }

    const d = msg.data;

    // Display chain stats if available
    if (d.chain_stats) {
      console.log('\n🔗 CHAIN STATS:');
      for (const [chain, stats] of Object.entries(d.chain_stats)) {
        if (typeof stats === 'object') {
          console.log(`  ${chain}:`);
          console.log(`    TPS: ${stats.tps || 'N/A'}`);
          console.log(`    Total Txs: ${stats.total_txs || stats.totalTxCount || 'N/A'}`);
          console.log(`    Gas Price: ${stats.gas_price || stats.gasPriceWei || 'N/A'}`);
        }
      }
    }

    // Display historical TPS
    if (d.historical_tps_24h && Array.isArray(d.historical_tps_24h)) {
      const tps = d.historical_tps_24h;
      console.log(`\n📈 HISTORICAL TPS (24h): ${tps.length} data points`);

      if (tps.length > 0) {
        const values = tps.map(t => t.value || t.tps || 0);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);
        const latest = values[values.length - 1];

        console.log(`  Latest:  ${latest.toLocaleString()} TPS`);
        console.log(`  Average: ${avg.toFixed(0).toLocaleString()} TPS`);
        console.log(`  Max:     ${max.toLocaleString()} TPS`);
        console.log(`  Min:     ${min.toLocaleString()} TPS`);

        // MegaETH claims comparison
        console.log('\n🚨 VS MEGAETH CLAIMS:');
        console.log(`  Claimed max TPS: 100,000+`);
        console.log(`  Actual max TPS:  ${max.toLocaleString()}`);
        console.log(`  Ratio:           ${(max / 100000 * 100).toFixed(1)}% of claimed`);
      }
    }

    // Display total transactions
    if (d.total_tx_count !== undefined || d.totalTxCount !== undefined) {
      const total = d.total_tx_count || d.totalTxCount;
      console.log(`\n💰 TOTAL TRANSACTIONS: ${Number(total).toLocaleString()}`);
    }

    // Display any other interesting fields
    const knownFields = ['chain_stats', 'historical_tps_24h', 'total_tx_count', 'totalTxCount'];
    const otherFields = Object.keys(d).filter(k => !knownFields.includes(k));

    if (otherFields.length > 0) {
      console.log('\n📋 OTHER DATA FIELDS:');
      for (const field of otherFields) {
        const val = d[field];
        if (typeof val === 'object' && val !== null) {
          console.log(`  ${field}: [object with ${Object.keys(val).length} keys]`);
        } else {
          console.log(`  ${field}: ${val}`);
        }
      }
    }
  }

  close() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}

// =============================================================================
// CLI
// =============================================================================
async function main() {
  const args = process.argv.slice(2);
  const continuous = args.includes('--continuous');
  const raw = args.includes('--raw');

  const client = new MegaETHStatsClient({ continuous, raw });

  // Handle exit gracefully
  process.on('SIGINT', () => {
    console.log('\n\nShutting down...');
    client.close();
    process.exit(0);
  });

  client.connect();

  // If not continuous, wait for a few messages then exit
  if (!continuous) {
    setTimeout(() => {
      console.log('\n\n📁 Data saved to ./ralphy-output/megaeth-live-stats.json');
      console.log('Run with --continuous for ongoing monitoring');
      client.close();
      process.exit(0);
    }, 10000);
  }
}

main().catch(console.error);
