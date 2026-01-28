use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::{Duration, Utc};

use super::types::{BlockMetrics, TransactionMetrics, WindowStats};

/// Maximum number of blocks to keep in memory (about 10 minutes at 10ms blocks)
const MAX_BLOCKS: usize = 60_000;

/// In-memory metrics store with rolling window support
pub struct MetricsStore {
    /// Block metrics ordered by block number
    blocks: RwLock<VecDeque<BlockMetrics>>,
    /// Transaction metrics ordered by block number
    transactions: RwLock<VecDeque<TransactionMetrics>>,
    /// Last processed block number
    last_block: RwLock<u64>,
}

impl MetricsStore {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            blocks: RwLock::new(VecDeque::with_capacity(MAX_BLOCKS)),
            transactions: RwLock::new(VecDeque::with_capacity(MAX_BLOCKS * 100)),
            last_block: RwLock::new(0),
        })
    }

    /// Add a new block's metrics
    pub async fn add_block(&self, block: BlockMetrics, txs: Vec<TransactionMetrics>) {
        let mut blocks = self.blocks.write().await;
        let mut transactions = self.transactions.write().await;
        let mut last_block = self.last_block.write().await;

        // Add new data
        blocks.push_back(block.clone());
        for tx in txs {
            transactions.push_back(tx);
        }
        *last_block = block.block_number;

        // Trim old data if needed
        while blocks.len() > MAX_BLOCKS {
            if let Some(old_block) = blocks.pop_front() {
                // Remove transactions for this block
                while transactions.front().map(|t| t.block_number) == Some(old_block.block_number) {
                    transactions.pop_front();
                }
            }
        }
    }

    /// Get the last processed block number
    pub async fn last_block_number(&self) -> u64 {
        *self.last_block.read().await
    }

    /// Get block metrics for a specific block
    pub async fn get_block(&self, block_number: u64) -> Option<BlockMetrics> {
        let blocks = self.blocks.read().await;
        blocks.iter().find(|b| b.block_number == block_number).cloned()
    }

    /// Get window statistics for the last N seconds
    pub async fn get_window_stats(&self, seconds: u64) -> WindowStats {
        let blocks = self.blocks.read().await;
        let transactions = self.transactions.read().await;

        let now = Utc::now();
        let window_start = now - Duration::seconds(seconds as i64);

        // Filter blocks within window
        let window_blocks: Vec<_> = blocks
            .iter()
            .filter(|b| b.timestamp >= window_start)
            .collect();

        // Filter transactions within window
        let window_txs: Vec<_> = transactions
            .iter()
            .filter(|t| t.timestamp >= window_start)
            .collect();

        if window_blocks.is_empty() {
            return WindowStats {
                window_start,
                window_end: now,
                ..Default::default()
            };
        }

        // Calculate aggregates
        let block_count = window_blocks.len() as u64;
        let tx_count = window_txs.len() as u64;

        // Sum all metrics
        let sum_total_gas: u64 = window_blocks.iter().map(|b| b.total_gas).sum();
        let sum_compute_gas: u64 = window_blocks.iter().map(|b| b.compute_gas).sum();
        let sum_storage_gas: u64 = window_blocks.iter().map(|b| b.storage_gas).sum();
        let sum_tx_size: u64 = window_blocks.iter().map(|b| b.tx_size).sum();
        let sum_da_size: u64 = window_blocks.iter().map(|b| b.da_size).sum();
        let sum_data_size: u64 = window_blocks.iter().map(|b| b.data_size).sum();
        let sum_kv_updates: u64 = window_blocks.iter().map(|b| b.kv_updates).sum();
        let sum_state_growth: u64 = window_blocks.iter().map(|b| b.state_growth).sum();

        // Calculate means (per block)
        let mean_total_gas = sum_total_gas as f64 / block_count as f64;
        let mean_compute_gas = sum_compute_gas as f64 / block_count as f64;
        let mean_storage_gas = sum_storage_gas as f64 / block_count as f64;
        let mean_tx_size = sum_tx_size as f64 / block_count as f64;
        let mean_da_size = sum_da_size as f64 / block_count as f64;
        let mean_data_size = sum_data_size as f64 / block_count as f64;
        let mean_kv_updates = sum_kv_updates as f64 / block_count as f64;
        let mean_state_growth = sum_state_growth as f64 / block_count as f64;

        // Calculate P95 (per transaction)
        let p95_total_gas = percentile(&window_txs, |t| t.total_gas, 95);
        let p95_compute_gas = percentile(&window_txs, |t| t.compute_gas, 95);
        let p95_storage_gas = percentile(&window_txs, |t| t.storage_gas, 95);
        let p95_tx_size = percentile(&window_txs, |t| t.tx_size, 95);
        let p95_da_size = percentile(&window_txs, |t| t.da_size, 95);
        let p95_data_size = percentile(&window_txs, |t| t.data_size, 95);
        let p95_kv_updates = percentile(&window_txs, |t| t.kv_updates, 95);
        let p95_state_growth = percentile(&window_txs, |t| t.state_growth, 95);

        // Calculate max (per transaction)
        let max_total_gas = window_txs.iter().map(|t| t.total_gas).max().unwrap_or(0);
        let max_compute_gas = window_txs.iter().map(|t| t.compute_gas).max().unwrap_or(0);
        let max_storage_gas = window_txs.iter().map(|t| t.storage_gas).max().unwrap_or(0);
        let max_tx_size = window_txs.iter().map(|t| t.tx_size).max().unwrap_or(0);
        let max_da_size = window_txs.iter().map(|t| t.da_size).max().unwrap_or(0);
        let max_data_size = window_txs.iter().map(|t| t.data_size).max().unwrap_or(0);
        let max_kv_updates = window_txs.iter().map(|t| t.kv_updates).max().unwrap_or(0);
        let max_state_growth = window_txs.iter().map(|t| t.state_growth).max().unwrap_or(0);

        WindowStats {
            window_start,
            window_end: now,
            block_count,
            tx_count,
            mean_total_gas,
            mean_compute_gas,
            mean_storage_gas,
            mean_tx_size,
            mean_da_size,
            mean_data_size,
            mean_kv_updates,
            mean_state_growth,
            p95_total_gas,
            p95_compute_gas,
            p95_storage_gas,
            p95_tx_size,
            p95_da_size,
            p95_data_size,
            p95_kv_updates,
            p95_state_growth,
            max_total_gas,
            max_compute_gas,
            max_storage_gas,
            max_tx_size,
            max_da_size,
            max_data_size,
            max_kv_updates,
            max_state_growth,
            sum_total_gas,
            sum_compute_gas,
            sum_storage_gas,
            sum_tx_size,
            sum_da_size,
            sum_data_size,
            sum_kv_updates,
            sum_state_growth,
        }
    }

    /// Get recent blocks (last N blocks)
    pub async fn get_recent_blocks(&self, count: usize) -> Vec<BlockMetrics> {
        let blocks = self.blocks.read().await;
        blocks.iter().rev().take(count).cloned().collect()
    }
}

/// Calculate percentile from a slice
fn percentile<T, F>(items: &[&T], extract: F, p: usize) -> u64
where
    F: Fn(&T) -> u64,
{
    if items.is_empty() {
        return 0;
    }

    let mut values: Vec<u64> = items.iter().map(|t| extract(t)).collect();
    values.sort_unstable();

    let idx = (values.len() * p / 100).min(values.len() - 1);
    values[idx]
}
