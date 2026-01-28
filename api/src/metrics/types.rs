use alloy_primitives::{Address, B256};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// All 8 MegaETH resource metrics for a transaction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionMetrics {
    /// Transaction hash
    pub tx_hash: B256,
    /// Block number this tx was included in
    pub block_number: u64,
    /// Block timestamp
    pub timestamp: DateTime<Utc>,
    /// Contract address interacted with (if any)
    pub to: Option<Address>,
    /// Sender address
    pub from: Address,

    // === The 8 Resource Metrics ===

    /// Total gas used (from receipt)
    pub total_gas: u64,
    /// Compute gas used (from mega-evm execution)
    pub compute_gas: u64,
    /// Storage gas used (calculated: total_gas - compute_gas)
    pub storage_gas: u64,
    /// Transaction size in bytes (RLP encoded size)
    pub tx_size: u64,
    /// Data availability size in bytes (fjord compressed)
    pub da_size: u64,
    /// Data size used during execution (from mega-evm)
    pub data_size: u64,
    /// KV updates count (from mega-evm)
    pub kv_updates: u64,
    /// State growth (from mega-evm)
    pub state_growth: u64,
}

/// Block-level aggregated metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockMetrics {
    /// Block number
    pub block_number: u64,
    /// Block hash
    pub block_hash: B256,
    /// Block timestamp
    pub timestamp: DateTime<Utc>,
    /// Number of transactions in block
    pub tx_count: u64,

    // === Aggregated Resource Metrics ===

    /// Total gas used in block
    pub total_gas: u64,
    /// Total compute gas in block
    pub compute_gas: u64,
    /// Total storage gas in block
    pub storage_gas: u64,
    /// Total transaction sizes in block
    pub tx_size: u64,
    /// Total DA size in block
    pub da_size: u64,
    /// Total data size in block
    pub data_size: u64,
    /// Total KV updates in block
    pub kv_updates: u64,
    /// Total state growth in block
    pub state_growth: u64,

    // === Per-block limits (for percentage calculations) ===

    /// Block gas limit
    pub gas_limit: u64,
}

/// Windowed statistics over a time period
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowStats {
    /// Start of the window
    pub window_start: DateTime<Utc>,
    /// End of the window
    pub window_end: DateTime<Utc>,
    /// Number of blocks in window
    pub block_count: u64,
    /// Number of transactions in window
    pub tx_count: u64,

    // === Mean values ===
    pub mean_total_gas: f64,
    pub mean_compute_gas: f64,
    pub mean_storage_gas: f64,
    pub mean_tx_size: f64,
    pub mean_da_size: f64,
    pub mean_data_size: f64,
    pub mean_kv_updates: f64,
    pub mean_state_growth: f64,

    // === P95 values ===
    pub p95_total_gas: u64,
    pub p95_compute_gas: u64,
    pub p95_storage_gas: u64,
    pub p95_tx_size: u64,
    pub p95_da_size: u64,
    pub p95_data_size: u64,
    pub p95_kv_updates: u64,
    pub p95_state_growth: u64,

    // === Max values ===
    pub max_total_gas: u64,
    pub max_compute_gas: u64,
    pub max_storage_gas: u64,
    pub max_tx_size: u64,
    pub max_da_size: u64,
    pub max_data_size: u64,
    pub max_kv_updates: u64,
    pub max_state_growth: u64,

    // === Totals ===
    pub sum_total_gas: u64,
    pub sum_compute_gas: u64,
    pub sum_storage_gas: u64,
    pub sum_tx_size: u64,
    pub sum_da_size: u64,
    pub sum_data_size: u64,
    pub sum_kv_updates: u64,
    pub sum_state_growth: u64,
}

impl Default for WindowStats {
    fn default() -> Self {
        let now = Utc::now();
        Self {
            window_start: now,
            window_end: now,
            block_count: 0,
            tx_count: 0,
            mean_total_gas: 0.0,
            mean_compute_gas: 0.0,
            mean_storage_gas: 0.0,
            mean_tx_size: 0.0,
            mean_da_size: 0.0,
            mean_data_size: 0.0,
            mean_kv_updates: 0.0,
            mean_state_growth: 0.0,
            p95_total_gas: 0,
            p95_compute_gas: 0,
            p95_storage_gas: 0,
            p95_tx_size: 0,
            p95_da_size: 0,
            p95_data_size: 0,
            p95_kv_updates: 0,
            p95_state_growth: 0,
            max_total_gas: 0,
            max_compute_gas: 0,
            max_storage_gas: 0,
            max_tx_size: 0,
            max_da_size: 0,
            max_data_size: 0,
            max_kv_updates: 0,
            max_state_growth: 0,
            sum_total_gas: 0,
            sum_compute_gas: 0,
            sum_storage_gas: 0,
            sum_tx_size: 0,
            sum_da_size: 0,
            sum_data_size: 0,
            sum_kv_updates: 0,
            sum_state_growth: 0,
        }
    }
}
