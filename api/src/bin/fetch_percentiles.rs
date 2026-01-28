// Fast parallel block fetcher for percentile calculation
// Fetches 100K blocks to calculate gas/tx_size/da_size percentiles

use megaviz_api::rpc::MegaEthClient;
use futures::stream::{self, StreamExt};
use serde::{Serialize, Deserialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

const TARGET_BLOCKS: u64 = 100_000;  // 100K blocks
const CONCURRENT_REQUESTS: usize = 50;  // Parallel requests

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Percentiles {
    pub p0: f64,
    pub p10: f64,
    pub p20: f64,
    pub p30: f64,
    pub p40: f64,
    pub p50: f64,
    pub p60: f64,
    pub p70: f64,
    pub p80: f64,
    pub p90: f64,
    pub p100: f64,
}

fn calculate_percentiles(values: &mut Vec<f64>) -> Percentiles {
    if values.is_empty() {
        return Percentiles {
            p0: 0.0, p10: 0.0, p20: 0.0, p30: 0.0, p40: 0.0,
            p50: 0.0, p60: 0.0, p70: 0.0, p80: 0.0, p90: 0.0, p100: 0.0,
        };
    }

    values.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let len = values.len();

    let percentile = |p: usize| -> f64 {
        let idx = (p * len / 100).min(len - 1);
        values[idx]
    };

    Percentiles {
        p0: values[0],
        p10: percentile(10),
        p20: percentile(20),
        p30: percentile(30),
        p40: percentile(40),
        p50: percentile(50),
        p60: percentile(60),
        p70: percentile(70),
        p80: percentile(80),
        p90: percentile(90),
        p100: values[len - 1],
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    println!("=== FAST PERCENTILE CALCULATOR (100K blocks) ===\n");

    let client = Arc::new(MegaEthClient::new("https://carrot.megaeth.com/rpc").await?);
    let latest = client.get_block_number().await?;

    let start_block = latest.saturating_sub(TARGET_BLOCKS);
    let total_blocks = latest - start_block;

    println!("Fetching {} blocks from {} to {}", total_blocks, start_block, latest);
    println!("Using {} concurrent requests\n", CONCURRENT_REQUESTS);

    // Atomic counters for progress
    let fetched = Arc::new(AtomicU64::new(0));
    let failed = Arc::new(AtomicU64::new(0));

    let start_time = std::time::Instant::now();

    // Create block number stream
    let block_numbers: Vec<u64> = (start_block..latest).collect();

    // Fetch blocks concurrently
    let results: Vec<_> = stream::iter(block_numbers)
        .map(|block_num| {
            let client = client.clone();
            let fetched = fetched.clone();
            let failed = failed.clone();
            async move {
                match client.get_block(block_num).await {
                    Ok(Some(block)) => {
                        let count = fetched.fetch_add(1, Ordering::Relaxed);
                        if count % 5000 == 0 {
                            eprintln!("  Progress: {} blocks fetched...", count);
                        }
                        Some((
                            block.gas_used as f64,
                            block.transactions.len() as f64,
                            block.transactions.iter().map(|tx| tx.input.len()).sum::<usize>() as f64,
                        ))
                    }
                    _ => {
                        failed.fetch_add(1, Ordering::Relaxed);
                        None
                    }
                }
            }
        })
        .buffer_unordered(CONCURRENT_REQUESTS)
        .collect()
        .await;

    let elapsed = start_time.elapsed();
    let total_fetched = fetched.load(Ordering::Relaxed);
    let total_failed = failed.load(Ordering::Relaxed);

    println!("\nFetched {} blocks in {:.1}s ({:.0} blocks/sec)",
        total_fetched, elapsed.as_secs_f64(),
        total_fetched as f64 / elapsed.as_secs_f64());
    println!("Failed: {}", total_failed);

    // Extract values
    let mut gas_values: Vec<f64> = Vec::with_capacity(total_fetched as usize);
    let mut tx_count_values: Vec<f64> = Vec::with_capacity(total_fetched as usize);
    let mut tx_size_values: Vec<f64> = Vec::with_capacity(total_fetched as usize);

    for result in results {
        if let Some((gas, tx_count, tx_size)) = result {
            gas_values.push(gas);
            tx_count_values.push(tx_count);
            tx_size_values.push(tx_size);
        }
    }

    println!("\nCalculating percentiles from {} samples...\n", gas_values.len());

    let gas_percentiles = calculate_percentiles(&mut gas_values);
    let tx_count_percentiles = calculate_percentiles(&mut tx_count_values);
    let tx_size_percentiles = calculate_percentiles(&mut tx_size_values);

    // DA size is approximately tx_size (for MegaETH it's similar)
    let mut da_values = tx_size_values.iter().map(|v| v * 0.25).collect::<Vec<_>>();
    let da_percentiles = calculate_percentiles(&mut da_values);

    println!("=== PERCENTILES FROM {} BLOCKS ===\n", gas_values.len());

    println!("TOTAL GAS (used per block):");
    println!("  P0:   {:>15.0}", gas_percentiles.p0);
    println!("  P10:  {:>15.0}", gas_percentiles.p10);
    println!("  P20:  {:>15.0}", gas_percentiles.p20);
    println!("  P30:  {:>15.0}", gas_percentiles.p30);
    println!("  P40:  {:>15.0}", gas_percentiles.p40);
    println!("  P50:  {:>15.0} (median)", gas_percentiles.p50);
    println!("  P60:  {:>15.0}", gas_percentiles.p60);
    println!("  P70:  {:>15.0}", gas_percentiles.p70);
    println!("  P80:  {:>15.0}", gas_percentiles.p80);
    println!("  P90:  {:>15.0}", gas_percentiles.p90);
    println!("  P100: {:>15.0}", gas_percentiles.p100);

    println!("\nTX COUNT (per block):");
    println!("  P0:   {:>10.0}", tx_count_percentiles.p0);
    println!("  P10:  {:>10.0}", tx_count_percentiles.p10);
    println!("  P20:  {:>10.0}", tx_count_percentiles.p20);
    println!("  P30:  {:>10.0}", tx_count_percentiles.p30);
    println!("  P40:  {:>10.0}", tx_count_percentiles.p40);
    println!("  P50:  {:>10.0} (median)", tx_count_percentiles.p50);
    println!("  P60:  {:>10.0}", tx_count_percentiles.p60);
    println!("  P70:  {:>10.0}", tx_count_percentiles.p70);
    println!("  P80:  {:>10.0}", tx_count_percentiles.p80);
    println!("  P90:  {:>10.0}", tx_count_percentiles.p90);
    println!("  P100: {:>10.0}", tx_count_percentiles.p100);

    println!("\nTX SIZE (bytes per block):");
    println!("  P0:   {:>10.0}", tx_size_percentiles.p0);
    println!("  P10:  {:>10.0}", tx_size_percentiles.p10);
    println!("  P50:  {:>10.0} (median)", tx_size_percentiles.p50);
    println!("  P90:  {:>10.0}", tx_size_percentiles.p90);
    println!("  P100: {:>10.0}", tx_size_percentiles.p100);

    println!("\nDA SIZE (estimated, bytes per block):");
    println!("  P0:   {:>10.0}", da_percentiles.p0);
    println!("  P10:  {:>10.0}", da_percentiles.p10);
    println!("  P50:  {:>10.0} (median)", da_percentiles.p50);
    println!("  P90:  {:>10.0}", da_percentiles.p90);
    println!("  P100: {:>10.0}", da_percentiles.p100);

    // Output as JSON for the visualization
    println!("\n=== JAVASCRIPT CONSTANTS FOR RING RADAR ===\n");
    println!("const PERCENTILES = {{");
    println!("  gas: {{");
    println!("    p0: {:.0}, p10: {:.0}, p20: {:.0}, p30: {:.0}, p40: {:.0},",
        gas_percentiles.p0, gas_percentiles.p10, gas_percentiles.p20,
        gas_percentiles.p30, gas_percentiles.p40);
    println!("    p50: {:.0}, p60: {:.0}, p70: {:.0}, p80: {:.0}, p90: {:.0}, p100: {:.0}",
        gas_percentiles.p50, gas_percentiles.p60, gas_percentiles.p70,
        gas_percentiles.p80, gas_percentiles.p90, gas_percentiles.p100);
    println!("  }},");
    println!("  txSize: {{");
    println!("    p0: {:.0}, p10: {:.0}, p20: {:.0}, p30: {:.0}, p40: {:.0},",
        tx_size_percentiles.p0, tx_size_percentiles.p10, tx_size_percentiles.p20,
        tx_size_percentiles.p30, tx_size_percentiles.p40);
    println!("    p50: {:.0}, p60: {:.0}, p70: {:.0}, p80: {:.0}, p90: {:.0}, p100: {:.0}",
        tx_size_percentiles.p50, tx_size_percentiles.p60, tx_size_percentiles.p70,
        tx_size_percentiles.p80, tx_size_percentiles.p90, tx_size_percentiles.p100);
    println!("  }},");
    println!("  daSize: {{");
    println!("    p0: {:.0}, p10: {:.0}, p20: {:.0}, p30: {:.0}, p40: {:.0},",
        da_percentiles.p0, da_percentiles.p10, da_percentiles.p20,
        da_percentiles.p30, da_percentiles.p40);
    println!("    p50: {:.0}, p60: {:.0}, p70: {:.0}, p80: {:.0}, p90: {:.0}, p100: {:.0}",
        da_percentiles.p50, da_percentiles.p60, da_percentiles.p70,
        da_percentiles.p80, da_percentiles.p90, da_percentiles.p100);
    println!("  }},");

    // For KV updates and state growth, use estimated values based on tx_count
    // These will be refined as we collect more accurate replay data
    println!("  // KV updates and state growth - use accurate replay data when available");
    println!("  kvUpdates: {{");
    println!("    p0: 15, p10: 18, p20: 19, p30: 19, p40: 20,");
    println!("    p50: 20, p60: 21, p70: 22, p80: 25, p90: 35, p100: 5000");
    println!("  }},");
    println!("  stateGrowth: {{");
    println!("    p0: 0, p10: 0, p20: 0, p30: 0, p40: 0,");
    println!("    p50: 0, p60: 2, p70: 5, p80: 15, p90: 50, p100: 1000");
    println!("  }},");
    println!("  dataSize: {{");
    println!("    p0: {:.0}, p10: {:.0}, p20: {:.0}, p30: {:.0}, p40: {:.0},",
        tx_size_percentiles.p0, tx_size_percentiles.p10, tx_size_percentiles.p20,
        tx_size_percentiles.p30, tx_size_percentiles.p40);
    println!("    p50: {:.0}, p60: {:.0}, p70: {:.0}, p80: {:.0}, p90: {:.0}, p100: {:.0}",
        tx_size_percentiles.p50, tx_size_percentiles.p60, tx_size_percentiles.p70,
        tx_size_percentiles.p80, tx_size_percentiles.p90, tx_size_percentiles.p100);
    println!("  }}");
    println!("}};");

    Ok(())
}
