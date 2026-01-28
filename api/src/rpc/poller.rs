use std::sync::Arc;
use std::time::Duration;
use serde::Serialize;
use tokio::sync::broadcast;
use tokio::time::interval;
use tracing::{debug, error, info, warn};

use crate::metrics::{BlockMetrics, MetricsStore};
use crate::processor::MetricsCalculator;

use super::client::MegaEthClient;

/// Block event for broadcasting
#[derive(Debug, Clone, Serialize)]
pub struct BlockEvent {
    pub block: BlockMetrics,
}

/// Polls MegaETH for new blocks and processes them
pub struct BlockPoller {
    client: MegaEthClient,
    store: Arc<MetricsStore>,
    calculator: MetricsCalculator,
    /// How far behind the head to stay (for reorg safety)
    confirmation_blocks: u64,
    /// Poll interval
    poll_interval: Duration,
    /// Broadcast sender for new blocks
    block_tx: broadcast::Sender<BlockEvent>,
}

impl BlockPoller {
    pub fn new(
        client: MegaEthClient,
        store: Arc<MetricsStore>,
        confirmation_blocks: u64,
        poll_interval: Duration,
        block_tx: broadcast::Sender<BlockEvent>,
    ) -> Self {
        Self {
            client,
            store,
            calculator: MetricsCalculator::new(),
            confirmation_blocks,
            poll_interval,
            block_tx,
        }
    }

    /// Start polling for new blocks (runs forever)
    pub async fn run(&self) {
        info!(
            "Starting block poller with {}ms interval, {} confirmation blocks",
            self.poll_interval.as_millis(),
            self.confirmation_blocks
        );

        let mut poll_timer = interval(self.poll_interval);

        loop {
            poll_timer.tick().await;

            if let Err(e) = self.poll_once().await {
                error!("Error polling blocks: {}", e);
            }
        }
    }

    /// Poll for new blocks once
    async fn poll_once(&self) -> anyhow::Result<()> {
        // Get the latest block number (minus confirmation blocks)
        let latest = self.client.get_latest_block_number().await?;
        let target = latest.saturating_sub(self.confirmation_blocks);

        // Get our last processed block
        let last_processed = self.store.last_block_number().await;

        // If we're starting fresh, start from a recent block
        let start_block = if last_processed == 0 {
            // Start from 100 blocks ago
            target.saturating_sub(100)
        } else {
            last_processed + 1
        };

        // Process any missing blocks
        if start_block <= target {
            let blocks_to_process = (target - start_block + 1).min(100); // Cap at 100 blocks per poll
            debug!(
                "Processing blocks {} to {} ({} blocks)",
                start_block,
                start_block + blocks_to_process - 1,
                blocks_to_process
            );

            for block_num in start_block..start_block + blocks_to_process {
                self.process_block(block_num).await?;
            }
        }

        Ok(())
    }

    /// Process a single block
    async fn process_block(&self, block_number: u64) -> anyhow::Result<()> {
        // Fetch block and receipts in parallel
        let (block_result, receipts_result) = tokio::join!(
            self.client.get_block(block_number),
            self.client.get_block_receipts(block_number)
        );

        let block = match block_result? {
            Some(b) => b,
            None => {
                warn!("Block {} not found", block_number);
                return Ok(());
            }
        };

        let receipts = receipts_result?;

        // Verify receipt count matches transaction count
        let tx_count = block.transactions.len();
        if receipts.len() != tx_count {
            warn!(
                "Block {} has {} transactions but {} receipts",
                block_number,
                tx_count,
                receipts.len()
            );
        }

        // Process the block
        let (block_metrics, tx_metrics) = self.calculator.process_block(&block, &receipts)?;

        debug!(
            "Block {} processed: {} txs, {} total gas, {} DA bytes",
            block_number, tx_metrics.len(), block_metrics.total_gas, block_metrics.da_size
        );

        // Store the metrics
        self.store.add_block(block_metrics.clone(), tx_metrics).await;

        // Broadcast to WebSocket subscribers
        let _ = self.block_tx.send(BlockEvent { block: block_metrics });

        Ok(())
    }
}
