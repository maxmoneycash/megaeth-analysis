/**
 * MegaETH Block Production Chart
 * 
 * A standalone HTML visualization showing real-time block production rates
 * for both Mini Blocks and EVM Blocks.
 * 
 * To view: Open megaeth-block-production.html in your browser
 * Or via dev server: http://localhost:5175/src/viz/BlockChart/megaeth-block-production.html
 * 
 * Uses BlockCountStream from ../streams for data subscription.
 */

// Re-export the stream for convenience
export { BlockCountStream } from '../../streams/BlockCountStream';

