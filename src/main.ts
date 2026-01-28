import './style.css';
import { Renderer } from './core/Renderer';
import { SpiralHeatmap } from './viz/SpiralHeatmap';
import { VizModal } from './viz/FullScreenViz';
import { MegaETHStream } from './streams/MegaETHStream';
import { TraceStream } from './streams/TraceStream';
import { OpcodeStream } from './streams/OpcodeStream';
import { GasAnalytics, AnalyticsModal } from './analytics';
import { Toolbar } from './ui';

// Initialize main canvas and renderer
const canvas = document.getElementById('viz-canvas') as HTMLCanvasElement;
const renderer = new Renderer(canvas, { targetFPS: 30 });

// Initialize spiral heatmap visualization
const heatmap = new SpiralHeatmap({
  maxContracts: 100,      // Track more contracts
  baseSquareSize: 120,    // Smaller base = more fit on screen
  animationSpeed: 4,
  windowMs: 300000,       // 5 minute rolling window (was 1 min)
});

// Initialize transaction detail modal
const vizModal = new VizModal();

// Initialize gas analytics
const gasAnalytics = new GasAnalytics();
const analyticsModal = new AnalyticsModal();
analyticsModal.setAnalytics(gasAnalytics);
analyticsModal.setCallbacks({
  onClose: () => {
    console.log('[MegaViz] Analytics modal closed');
    toolbar.setActiveButton(null);
  },
});

// Initialize mobile-friendly toolbar
const toolbar = new Toolbar();
toolbar.addButton({
  id: 'analytics',
  icon: '📊',
  label: 'Analytics',
  onClick: () => {
    if (analyticsModal.isVisible) {
      analyticsModal.close();
      toolbar.setActiveButton(null);
    } else {
      analyticsModal.open();
      toolbar.setActiveButton('analytics');
      console.log('[MegaViz] Analytics modal opened');
    }
  },
});
toolbar.addButton({
  id: 'refresh',
  icon: '🔄',
  label: 'Refresh',
  onClick: () => {
    console.log('[MegaViz] Manual refresh triggered');
    // Force re-fetch by resetting block number (handled internally)
  },
});
toolbar.addButton({
  id: 'info',
  icon: 'ℹ️',
  label: 'Info',
  onClick: () => {
    console.log('[MegaViz] Showing info');
    alert('MegaViz - Real-time MegaETH Transaction Visualizer\n\nTap any contract square to see details.\nTap a transaction to view its flame graph.\n\nData updates every 500ms from MegaETH testnet.');
  },
});

// Initialize data streams
const megaStream = new MegaETHStream({
  rpcUrl: 'https://carrot.megaeth.com/rpc',
  pollInterval: 500,
});

const traceStream = new TraceStream({
  rpcUrl: 'https://carrot.megaeth.com/rpc',
});

const opcodeStream = new OpcodeStream({
  rpcUrl: 'https://carrot.megaeth.com/rpc',
});

// Wire up modal callbacks
vizModal.setCallbacks({
  onClose: () => {
    console.log('[MegaViz] Modal closed');
  },
  onRequestOpcodes: async (txHash: string) => {
    console.log('[MegaViz] Requesting opcodes for:', txHash);
    return opcodeStream.getOpcodeBreakdown(txHash);
  },
});

// Connect stream to spiral heatmap AND track gas analytics from ALL transactions
megaStream.subscribe((miniBlock) => {
  heatmap.processMiniBlock(miniBlock);

  // Record gas for ALL transactions (not just clicked ones)
  const timestamp = miniBlock.timestamp || Date.now();
  for (const tx of miniBlock.transactions) {
    if (tx.to && tx.gasUsed) {
      gasAnalytics.recordGas(
        tx.to,
        '0x00000000', // Unknown function selector for block-level tracking
        tx.gasUsed,
        tx.hash,
        timestamp
      );
    }
  }
});

// Wire up trace requester for inline mini viz
heatmap.setTraceRequester((txHash) => traceStream.getTrace(txHash));

// Wire up expand button to open full flame graph modal
heatmap.onMiniVizExpand(() => {
  const trace = heatmap.getMiniVizTrace();
  if (trace) {
    console.log('[MegaViz] Opening modal for trace:', trace.txHash);
    vizModal.open(trace);
  }
});

// Connection status indicator
megaStream.onStateChange((state) => {
  console.log('[MegaViz] Connection state:', state);
});

// Set up transaction click handler - opens modal with flame graph
heatmap.onTransactionClick(async (tx) => {
  console.log('[MegaViz] Loading flame graph for tx:', tx.hash);

  try {
    const trace = await traceStream.getTrace(tx.hash);
    if (trace) {
      // Record gas analytics
      gasAnalytics.recordFromTrace(trace);

      vizModal.open(trace);
      console.log('[MegaViz] Modal opened with:', trace.frames.length, 'frames');
    } else {
      console.warn('[MegaViz] No trace available for transaction');
    }
  } catch (e) {
    console.error('[MegaViz] Failed to load trace:', e);
  }
});

// Handle mouse/touch interactions
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Check toolbar first (always accessible)
  if (toolbar.handleClick(x, y)) {
    return;
  }

  // Analytics modal has highest priority
  if (analyticsModal.isVisible) {
    analyticsModal.handleClick(x, y);
    return;
  }

  // VizModal next
  if (vizModal.isVisible) {
    vizModal.handleClick(x, y);
    return;
  }

  heatmap.handleClick(x, y);
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Check toolbar first
  toolbar.handleMouseMove(x, y);

  // Analytics modal has highest priority
  if (analyticsModal.isVisible) {
    analyticsModal.handleMouseMove(x, y);
    return;
  }

  // VizModal next
  if (vizModal.isVisible) {
    vizModal.handleMouseMove(x, y);
    return;
  }

  heatmap.handleMouseMove(x, y);
});

// Touch events for mobile
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;

  // Check toolbar first
  if (toolbar.handleClick(x, y)) {
    return;
  }

  // Analytics modal
  if (analyticsModal.isVisible) {
    analyticsModal.handleClick(x, y);
    return;
  }

  // VizModal
  if (vizModal.isVisible) {
    vizModal.handleClick(x, y);
    return;
  }

  heatmap.handleClick(x, y);
}, { passive: false });

// Handle resize
window.addEventListener('resize', () => {
  renderer.resize();
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  // Escape closes modals
  if (e.key === 'Escape') {
    if (analyticsModal.isVisible) {
      analyticsModal.close();
    } else if (vizModal.isVisible) {
      vizModal.close();
    }
    return;
  }

  // 'A' opens analytics modal
  if (e.key === 'a' || e.key === 'A') {
    if (!analyticsModal.isVisible && !vizModal.isVisible) {
      analyticsModal.open();
      console.log('[MegaViz] Analytics modal opened');
    }
  }
});

// Start the stream and renderer
megaStream.start();
renderer.start((dt) => {
  // Always render heatmap as base layer
  heatmap.render(renderer, dt);

  const ctx = renderer.context;

  // Render VizModal if open
  if (vizModal.isVisible) {
    vizModal.render(ctx, renderer.width, renderer.height, dt);
  }

  // Render AnalyticsModal on top (highest priority)
  if (analyticsModal.isVisible) {
    analyticsModal.render(ctx, renderer.width, renderer.height, dt);
  }

  // Always render toolbar on top (mobile-friendly access)
  toolbar.render(ctx, renderer.width, renderer.height);
});

// Log startup
console.log('[MegaViz] Golden Ratio Spiral Heatmap started');
console.log('[MegaViz] Tracking trending contracts on MegaETH testnet');
console.log('[MegaViz] Tap toolbar buttons for Analytics | Tap contracts to explore');

// Debug helper - accessible from browser console as window.megaDebug
interface MegaDebug {
  getTopContracts: (n?: number) => void;
  getContractTxs: (address: string) => void;
  fetchTrace: (txHash: string) => Promise<void>;
  getGasStats: (window?: '1m' | '1h' | '24h' | '7d') => void;
  openAnalytics: () => void;
  help: () => void;
}

const megaDebug: MegaDebug = {
  help: () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    MegaViz Debug Commands                        ║
╠══════════════════════════════════════════════════════════════════╣
║  megaDebug.getTopContracts(10)  - Show top 10 contracts          ║
║  megaDebug.getContractTxs(addr) - Show transactions for contract ║
║  megaDebug.fetchTrace(txHash)   - Fetch & log trace for tx       ║
║  megaDebug.getGasStats('1h')    - Show gas stats (1m/1h/24h/7d)  ║
║  megaDebug.openAnalytics()      - Open gas analytics modal       ║
║  megaDebug.help()               - Show this help                 ║
╠══════════════════════════════════════════════════════════════════╣
║  Keyboard: A = Open Analytics | ESC = Close modals              ║
╚══════════════════════════════════════════════════════════════════╝
    `);
  },

  getTopContracts: (n = 10) => {
    const tracker = heatmap.getTracker();
    const contracts = tracker.getTopContracts(n);

    console.log(`\n═══ Top ${n} Contracts ═══`);
    console.table(
      contracts.map((c, i) => ({
        '#': i + 1,
        address: c.address.slice(0, 12) + '...' + c.address.slice(-6),
        txCount: c.txCount,
        velocity: c.velocity.toFixed(3) + '/s',
        heat: (c.heat * 100).toFixed(1) + '%',
        recentTxs: c.recentTxs.length,
      }))
    );

    console.log('\nTo see transactions for a contract, run:');
    console.log(`  megaDebug.getContractTxs("${contracts[0]?.address || '0x...'}")`);
  },

  getContractTxs: (address: string) => {
    const tracker = heatmap.getTracker();
    const contract = tracker.getContract(address);

    if (!contract) {
      console.log(`Contract ${address} not found in tracker`);
      return;
    }

    console.log(`\n═══ Transactions for ${address.slice(0, 12)}...${address.slice(-6)} ═══`);
    console.log(`Total: ${contract.txCount} | Velocity: ${contract.velocity.toFixed(3)}/s | Heat: ${(contract.heat * 100).toFixed(1)}%`);
    console.log('\nRecent transactions:');
    console.table(
      contract.recentTxs.map((tx, i) => ({
        '#': i + 1,
        hash: tx.hash.slice(0, 12) + '...' + tx.hash.slice(-6),
        from: tx.from.slice(0, 10) + '...',
        age: Math.round((Date.now() - tx.timestamp) / 1000) + 's ago',
      }))
    );

    console.log('\nTo fetch trace for a transaction, run:');
    console.log(`  megaDebug.fetchTrace("${contract.recentTxs[0]?.hash || '0x...'}")`);
  },

  fetchTrace: async (txHash: string) => {
    console.log(`\n═══ Fetching trace for ${txHash.slice(0, 18)}... ═══`);
    console.log('(Watch for [TraceStream] logs above for call tree details)\n');

    const trace = await traceStream.getTrace(txHash);

    if (!trace) {
      console.log('❌ Failed to fetch trace');
      return;
    }

    console.log('\n═══ Trace Summary ═══');
    console.log(`Tx Hash: ${trace.txHash}`);
    console.log(`Total Gas: ${trace.totalGas.toLocaleString()}`);
    console.log(`Max Depth: ${trace.maxDepth}`);
    console.log(`Contract Count: ${trace.contractCount}`);
    console.log(`Total Frames: ${trace.frames.length}`);

    console.log('\n═══ Call Frames ═══');
    console.table(
      trace.frames.map(f => ({
        depth: f.depth,
        address: f.address.slice(0, 10) + '...',
        function: f.functionName,
        callType: f.callType,
        selfGas: f.selfGas.toLocaleString(),
        gasPercent: f.gasPercent.toFixed(1) + '%',
        hasError: f.hasError ? '❌' : '',
      }))
    );

    if (trace.maxDepth <= 1) {
      console.log('\n⚠️  This is a SIMPLE transaction with no internal calls.');
      console.log('   The callTracer only shows contract-to-contract calls.');
      console.log('   Simple EOA→Contract transactions will only have 1-2 frames.');
    }
  },

  getGasStats: (windowKey: '1m' | '1h' | '24h' | '7d' = '1h') => {
    const stats = gasAnalytics.getStats(windowKey);

    console.log(`\n═══ Gas Analytics (${windowKey}) ═══`);
    console.log(`Total Gas: ${stats.totalGas.toLocaleString()}`);
    console.log(`Total Transactions: ${stats.totalTxCount}`);
    console.log(`Contracts Active: ${stats.contracts.length}`);

    if (stats.contracts.length > 0) {
      console.log('\n═══ Top Contracts by Gas ═══');
      console.table(
        stats.contracts.slice(0, 10).map((c, i) => ({
          '#': i + 1,
          address: c.address.slice(0, 12) + '...' + c.address.slice(-6),
          totalGas: c.totalGas.toLocaleString(),
          percent: c.percentOfTotal.toFixed(1) + '%',
          txCount: c.txCount,
          topFunction: c.functionBreakdown[0]?.name || '-',
        }))
      );
    }

    if (stats.topFunctions.length > 0) {
      console.log('\n═══ Top Functions by Gas ═══');
      console.table(
        stats.topFunctions.slice(0, 10).map((f, i) => ({
          '#': i + 1,
          function: f.name,
          selector: f.selector,
          totalGas: f.totalGas.toLocaleString(),
          calls: f.callCount,
          avgGas: f.avgGas.toLocaleString(),
        }))
      );
    }

    console.log(`\nRecorded entries: ${gasAnalytics.getEntryCount()}`);
    console.log('Tip: Press "A" to open the visual analytics modal');
  },

  openAnalytics: () => {
    analyticsModal.open();
    console.log('[MegaViz] Analytics modal opened');
  },
};

// Expose to window
(window as unknown as { megaDebug: MegaDebug }).megaDebug = megaDebug;

console.log('\n💡 Debug commands available! Type: megaDebug.help()\n');
