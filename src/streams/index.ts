export { DataStream } from './DataStream';
export type { StreamOptions, DataHandler, ConnectionState } from './DataStream';
export { RingBuffer } from './RingBuffer';
export { MegaETHStream } from './MegaETHStream';
export type { MegaETHStreamOptions } from './MegaETHStream';
export { TraceStream } from './TraceStream';
export type { TraceStreamOptions } from './TraceStream';

// Aptos-style polling architecture
export { MegaETHPolling } from './MegaETHPolling';
export type {
  MegaBlock,
  MegaBlockWithTxs,
  MegaBlockTransaction,
  MegaMetrics,
  TPSDataPoint,
  LatencySample,
  LatencyStats,
  MegaPollingOptions,
  LatencyTrackerOptions,
} from './types';
