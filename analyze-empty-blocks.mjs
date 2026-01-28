import WebSocket from 'ws';

console.log('=== Analyzing Empty Mini-Blocks ===\n');

const ws = new WebSocket('wss://carrot.megaeth.com/ws');

let miniBlockCount = 0;
let emptyCount = 0;
let lowCount = 0;  // < 50 tx
const txCounts = [];
const emptyIndices = [];  // Track which indices have 0 tx

ws.on('open', () => {
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_subscribe',
    params: ['miniBlocks']
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id) return;  // Skip subscription confirmation
  
  if (msg.method === 'eth_subscription' && msg.params?.result) {
    const mb = msg.params.result;
    const txCount = mb.transactions?.length || 0;
    
    miniBlockCount++;
    txCounts.push(txCount);
    
    if (txCount === 0) {
      emptyCount++;
      emptyIndices.push(mb.index);
      console.log(`[EMPTY] Mini-block #${mb.number} (index ${mb.index} in main block ${mb.block_number})`);
    } else if (txCount < 50) {
      lowCount++;
      console.log(`[LOW: ${txCount}] Mini-block #${mb.number} (index ${mb.index})`);
    }
    
    if (miniBlockCount >= 200) {
      console.log('\n=== SUMMARY (200 mini-blocks) ===');
      console.log(`Empty (0 tx): ${emptyCount} (${(emptyCount/200*100).toFixed(1)}%)`);
      console.log(`Low (<50 tx): ${lowCount} (${(lowCount/200*100).toFixed(1)}%)`);
      console.log(`Normal (50+ tx): ${200 - emptyCount - lowCount}`);
      console.log(`\nEmpty mini-block indices within main blocks: ${[...new Set(emptyIndices)].sort((a,b) => a-b).join(', ')}`);
      console.log(`\nTx distribution:`);
      console.log(`  Min: ${Math.min(...txCounts)}`);
      console.log(`  Max: ${Math.max(...txCounts)}`);
      console.log(`  Avg: ${(txCounts.reduce((a,b) => a+b, 0) / txCounts.length).toFixed(1)}`);
      ws.close();
    }
  }
});

ws.on('error', (err) => console.error('Error:', err.message));
ws.on('close', () => process.exit(0));

setTimeout(() => { ws.close(); }, 30000);
