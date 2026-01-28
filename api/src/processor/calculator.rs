use anyhow::Result;
use chrono::{DateTime, TimeZone, Utc};

use crate::metrics::{BlockMetrics, TransactionMetrics};
use crate::rpc::{RawBlock, RawReceipt, RawTransaction};

/// Deposit transaction type (Optimism L1->L2 deposits)
const DEPOSIT_TX_TYPE: u8 = 126;

/// Calculates all 8 MegaETH resource metrics from block data
pub struct MetricsCalculator;

impl MetricsCalculator {
    pub fn new() -> Self {
        Self
    }

    /// Process a block and its receipts to extract all metrics
    pub fn process_block(
        &self,
        block: &RawBlock,
        receipts: &[RawReceipt],
    ) -> Result<(BlockMetrics, Vec<TransactionMetrics>)> {
        let block_number = block.number;
        let block_hash = block.hash;
        let timestamp = timestamp_to_datetime(block.timestamp);
        let gas_limit = block.gas_limit;

        let mut tx_metrics = Vec::new();
        let mut total_gas_sum: u64 = 0;
        let mut compute_gas_sum: u64 = 0;
        let mut storage_gas_sum: u64 = 0;
        let mut tx_size_sum: u64 = 0;
        let mut da_size_sum: u64 = 0;
        let mut data_size_sum: u64 = 0;
        let mut kv_updates_sum: u64 = 0;
        let mut state_growth_sum: u64 = 0;

        // Create a map of receipts by hash for lookup
        let receipt_map: std::collections::HashMap<_, _> = receipts
            .iter()
            .map(|r| (r.transaction_hash, r))
            .collect();

        // Process each transaction
        for tx in &block.transactions {
            let receipt = receipt_map.get(&tx.hash);

            // Get gas from receipt if available, otherwise use tx gas
            let total_gas = receipt.map(|r| r.gas_used).unwrap_or(tx.gas);

            // Calculate tx_size using exact EIP-2718 encoding
            let tx_size = tx.encoded_size();

            // DA size: deposits are exempt (not posted to DA)
            let is_deposit = tx.tx_type == DEPOSIT_TX_TYPE;
            let da_size = if is_deposit {
                0
            } else {
                // Use FastLZ compressed size (same compression MegaETH uses for DA)
                let tx_bytes = tx.to_bytes_for_da();
                op_alloy_flz::flz_compress_len(&tx_bytes) as u64
            };

            // Estimate mega-evm metrics
            let input_len = tx.input.len() as u64;
            let (compute_gas, data_size, kv_updates, state_growth) =
                estimate_mega_evm_metrics(total_gas, input_len);

            let storage_gas = total_gas.saturating_sub(compute_gas);

            let metrics = TransactionMetrics {
                tx_hash: tx.hash,
                block_number,
                timestamp,
                to: tx.to,
                from: tx.from,
                total_gas,
                compute_gas,
                storage_gas,
                tx_size,
                da_size,
                data_size,
                kv_updates,
                state_growth,
            };

            // Aggregate sums
            total_gas_sum += total_gas;
            compute_gas_sum += compute_gas;
            storage_gas_sum += storage_gas;
            tx_size_sum += tx_size;
            da_size_sum += da_size;
            data_size_sum += data_size;
            kv_updates_sum += kv_updates;
            state_growth_sum += state_growth;

            tx_metrics.push(metrics);
        }

        let block_metrics = BlockMetrics {
            block_number,
            block_hash,
            timestamp,
            tx_count: tx_metrics.len() as u64,
            total_gas: total_gas_sum,
            compute_gas: compute_gas_sum,
            storage_gas: storage_gas_sum,
            tx_size: tx_size_sum,
            da_size: da_size_sum,
            data_size: data_size_sum,
            kv_updates: kv_updates_sum,
            state_growth: state_growth_sum,
            gas_limit,
        };

        Ok((block_metrics, tx_metrics))
    }
}

/// Convert Unix timestamp to DateTime<Utc>
fn timestamp_to_datetime(timestamp: u64) -> DateTime<Utc> {
    Utc.timestamp_opt(timestamp as i64, 0)
        .single()
        .unwrap_or_else(Utc::now)
}

/// Estimate mega-evm metrics (placeholder until mega-evm is integrated)
fn estimate_mega_evm_metrics(total_gas: u64, input_len: u64) -> (u64, u64, u64, u64) {
    // Estimate compute gas (typically 60-80% of total for contract calls)
    let compute_gas = if input_len > 4 {
        // Contract call - estimate 70% compute
        (total_gas as f64 * 0.7) as u64
    } else {
        // Simple transfer - mostly storage
        (total_gas as f64 * 0.3) as u64
    };

    // Estimate data size from input length
    let data_size = input_len;

    // Estimate KV updates from gas usage
    let kv_updates = (total_gas / 20_000).max(1);

    // Estimate state growth (subset of KV updates that are new)
    let state_growth = kv_updates / 5;

    (compute_gas, data_size, kv_updates, state_growth)
}
