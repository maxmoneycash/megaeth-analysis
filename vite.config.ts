import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/megaeth-rpc': {
        target: 'https://mainnet.megaeth.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/megaeth-rpc/, '/rpc'),
      },
      '/miniblocks-api': {
        target: 'https://miniblocks.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/miniblocks-api/, '/api'),
      },
      // WebSocket proxy for miniblocks.io real-time data
      '/miniblocks-ws': {
        target: 'wss://miniblocks.io',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/miniblocks-ws/, '/websocket'),
      },
    },
  },
});
