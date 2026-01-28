#!/usr/bin/env node
/**
 * WebSocket Proxy Server for miniblocks.io
 *
 * Vite can't proxy WebSockets to external origins in the browser.
 * This simple proxy bridges the browser to miniblocks.io WebSocket.
 *
 * Run: node ws-proxy.mjs
 * Browser connects to: ws://localhost:8765
 * Proxy connects to: wss://miniblocks.io/websocket
 */

import { WebSocketServer, WebSocket } from 'ws';

const PROXY_PORT = 8765;
const TARGET_WS = 'wss://miniblocks.io/websocket';

const wss = new WebSocketServer({ port: PROXY_PORT });

console.log(`[WS Proxy] Listening on ws://localhost:${PROXY_PORT}`);
console.log(`[WS Proxy] Forwarding to ${TARGET_WS}`);

wss.on('connection', (clientWs, req) => {
  console.log('[WS Proxy] Browser connected');

  // Connect to miniblocks.io
  const targetWs = new WebSocket(TARGET_WS);

  targetWs.on('open', () => {
    console.log('[WS Proxy] Connected to miniblocks.io');
  });

  targetWs.on('message', (data) => {
    // Forward miniblocks.io messages to browser
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data.toString());
    }
  });

  targetWs.on('error', (err) => {
    console.error('[WS Proxy] Target error:', err.message);
  });

  targetWs.on('close', () => {
    console.log('[WS Proxy] Target closed');
    clientWs.close();
  });

  // Forward browser messages to miniblocks.io
  clientWs.on('message', (data) => {
    if (targetWs.readyState === WebSocket.OPEN) {
      targetWs.send(data.toString());
    }
  });

  clientWs.on('close', () => {
    console.log('[WS Proxy] Browser disconnected');
    targetWs.close();
  });

  clientWs.on('error', (err) => {
    console.error('[WS Proxy] Client error:', err.message);
  });
});

console.log('[WS Proxy] Ready. Browser should connect to ws://localhost:8765');
