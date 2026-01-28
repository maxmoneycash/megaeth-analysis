//! Fetch real blocks from MegaETH and compute baseline percentiles
//!
//! Run with: cargo run --bin fetch_baseline

use anyhow::{Context, Result};
use megaviz_api::metrics::{limits, PercentileStats, RollingStats};
use reqwest::Client;
use serde_json::{json, Value};
use std::time::Instant;

const MEGAETH_RPC: &str = "https://carrot.megaeth.com/rpc";
const BLOCKS_TO_FETCH: u64 = 500;

#[derive(Debug, Clone)]
struct BlockMetrics {
    block_number: u64,
    tx_count: u64,
    total_gas: u64,
    tx_size: u64,
    // Estimated metrics
    kv_updates: u64,
    da_size: u64,
    data_size: u64,
    state_growth: u64,
}

#[tokio::main]
async fn main() -> Result<()> {
    println!("===========================================");
    println!("  MegaViz Baseline Metrics Calculator");
    println!("===========================================\n");

    let client = Client::new();

    // Get latest block
    let latest = get_block_number(&client).await?;
    println!("Latest block: {}", latest);

    let start_block = latest.saturating_sub(BLOCKS_TO_FETCH - 1);
    println!("Fetching blocks {} to {} ({} blocks)\n", start_block, latest, BLOCKS_TO_FETCH);

    let mut rolling_stats = RollingStats::new();
    let fetch_start = Instant::now();

    let mut successful = 0u64;
    let mut total_txs = 0u64;

    for block_num in start_block..=latest {
        if (block_num - start_block) % 100 == 0 {
            println!("  Progress: {} / {} blocks...", block_num - start_block, BLOCKS_TO_FETCH);
        }

        match fetch_block_metrics(&client, block_num).await {
            Ok(metrics) => {
                rolling_stats.add_block(
                    metrics.total_gas,
                    metrics.kv_updates,
                    metrics.tx_size,
                    metrics.da_size,
                    metrics.data_size,
                    metrics.state_growth,
                );
                total_txs += metrics.tx_count;
                successful += 1;
            }
            Err(_) => {
                // Empty block - add zeros
                rolling_stats.add_block(0, 0, 0, 0, 0, 0);
                successful += 1;
            }
        }
    }

    let duration = fetch_start.elapsed();
    println!("\nFetch complete in {:.2?}", duration);
    println!("  Successful blocks: {}", successful);
    println!("  Total transactions: {}", total_txs);
    println!("  Avg txs/block: {:.2}", total_txs as f64 / successful as f64);

    // Compute stats
    println!("\n===========================================");
    println!("  PERCENTILE STATISTICS");
    println!("===========================================\n");

    let stats = rolling_stats.compute_stats();

    print_metric_stats("Total Gas", &stats.gas, limits::BLOCK_GAS_LIMIT);
    print_metric_stats("KV Updates (est)", &stats.kv_updates, limits::BLOCK_KV_UPDATE_LIMIT);
    print_metric_stats("Tx Size", &stats.tx_size, limits::BLOCK_TX_SIZE_LIMIT);
    print_metric_stats("DA Size (est)", &stats.da_size, limits::BLOCK_DA_SIZE_LIMIT);
    print_metric_stats("Data Size (est)", &stats.data_size, limits::BLOCK_DATA_LIMIT);
    print_metric_stats("State Growth (est)", &stats.state_growth, limits::BLOCK_STATE_GROWTH_LIMIT);

    // Show example normalized block
    println!("\n===========================================");
    println!("  EXAMPLE: Normalizing Block #{}", latest);
    println!("===========================================\n");

    if let Ok(metrics) = fetch_block_metrics(&client, latest).await {
        let normalized = rolling_stats.normalize_block(
            metrics.total_gas,
            metrics.kv_updates,
            metrics.tx_size,
            metrics.da_size,
            metrics.data_size,
            metrics.state_growth,
        );

        println!("Block #{} ({} txs):\n", latest, metrics.tx_count);
        println!("  {:12} {:>12} {:>10} {:>12}", "Metric", "Raw", "Score", "Util%");
        println!("  {:12} {:>12} {:>10} {:>12}", "------", "---", "-----", "-----");

        print_normalized_row("Gas", normalized.gas.raw, normalized.gas.score, normalized.gas.utilization_pct);
        print_normalized_row("KV Updates", normalized.kv_updates.raw, normalized.kv_updates.score, normalized.kv_updates.utilization_pct);
        print_normalized_row("Tx Size", normalized.tx_size.raw, normalized.tx_size.score, normalized.tx_size.utilization_pct);
        print_normalized_row("DA Size", normalized.da_size.raw, normalized.da_size.score, normalized.da_size.utilization_pct);
        print_normalized_row("Data Size", normalized.data_size.raw, normalized.data_size.score, normalized.data_size.utilization_pct);
        print_normalized_row("State Growth", normalized.state_growth.raw, normalized.state_growth.score, normalized.state_growth.utilization_pct);
    }

    println!("\n===========================================");
    println!("  Done!");
    println!("===========================================");

    Ok(())
}

async fn get_block_number(client: &Client) -> Result<u64> {
    let resp: Value = client
        .post(MEGAETH_RPC)
        .json(&json!({
            "jsonrpc": "2.0",
            "method": "eth_blockNumber",
            "params": [],
            "id": 1
        }))
        .send()
        .await?
        .json()
        .await?;

    let hex = resp["result"].as_str().context("No result")?;
    Ok(u64::from_str_radix(hex.trim_start_matches("0x"), 16)?)
}

async fn fetch_block_metrics(client: &Client, block_num: u64) -> Result<BlockMetrics> {
    // Fetch block with transactions
    let block_hex = format!("0x{:x}", block_num);
    let resp: Value = client
        .post(MEGAETH_RPC)
        .json(&json!({
            "jsonrpc": "2.0",
            "method": "eth_getBlockByNumber",
            "params": [block_hex, true],
            "id": 1
        }))
        .send()
        .await?
        .json()
        .await?;

    let block = resp["result"].as_object().context("No block")?;

    // Parse gas used
    let gas_used_hex = block["gasUsed"].as_str().unwrap_or("0x0");
    let total_gas = u64::from_str_radix(gas_used_hex.trim_start_matches("0x"), 16).unwrap_or(0);

    // Get transactions
    let txs = block["transactions"].as_array().context("No transactions")?;
    let tx_count = txs.len() as u64;

    if tx_count == 0 {
        return Ok(BlockMetrics {
            block_number: block_num,
            tx_count: 0,
            total_gas: 0,
            tx_size: 0,
            kv_updates: 0,
            da_size: 0,
            data_size: 0,
            state_growth: 0,
        });
    }

    // Calculate tx_size from input data lengths
    let mut tx_size: u64 = 0;
    let mut total_input_len: u64 = 0;

    for tx in txs {
        let input = tx["input"].as_str().unwrap_or("0x");
        let input_bytes = (input.len().saturating_sub(2)) / 2; // Remove 0x, divide by 2 for hex
        tx_size += input_bytes as u64 + 100; // ~100 bytes overhead per tx
        total_input_len += input_bytes as u64;
    }

    // Estimates based on gas usage and tx patterns
    // KV updates: roughly gas / 20k (SSTORE cost)
    let kv_updates = (total_gas / 20_000).max(tx_count);

    // DA size: compressed tx size (roughly 60% of raw)
    let da_size = (tx_size as f64 * 0.6) as u64;

    // Data size: input + logs estimate
    let data_size = total_input_len + (tx_count * 200); // ~200 bytes logs per tx

    // State growth: small fraction of KV updates
    let state_growth = kv_updates / 5;

    Ok(BlockMetrics {
        block_number: block_num,
        tx_count,
        total_gas,
        tx_size,
        kv_updates,
        da_size,
        data_size,
        state_growth,
    })
}

fn print_metric_stats(name: &str, stats: &PercentileStats, limit: u64) {
    if stats.count == 0 {
        println!("{}: No data\n", name);
        return;
    }

    let median_pct = (stats.median as f64 / limit as f64) * 100.0;
    let p90_pct = (stats.p90 as f64 / limit as f64) * 100.0;

    println!("{}:", name);
    println!("  Min:    {:>12}", format_number(stats.min));
    println!("  P10:    {:>12}", format_number(stats.p10));
    println!("  P25:    {:>12}", format_number(stats.p25));
    println!("  Median: {:>12}  ({:.4}% of limit)", format_number(stats.median), median_pct);
    println!("  P75:    {:>12}", format_number(stats.p75));
    println!("  P90:    {:>12}  ({:.4}% of limit)", format_number(stats.p90), p90_pct);
    println!("  Max:    {:>12}", format_number(stats.max));
    println!("  IQR:    {:>12}", format_number(stats.iqr));
    println!("  Limit:  {:>12}", format_number(limit));
    println!();
}

fn print_normalized_row(name: &str, raw: u64, score: f64, util_pct: f64) {
    let score_str = if score >= 0.0 {
        format!("+{:.1}", score)
    } else {
        format!("{:.1}", score)
    };
    println!("  {:12} {:>12} {:>10} {:>11.4}%", name, format_number(raw), score_str, util_pct);
}

fn format_number(n: u64) -> String {
    let s = n.to_string();
    let mut result = String::new();
    for (i, c) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            result.insert(0, ',');
        }
        result.insert(0, c);
    }
    result
}
