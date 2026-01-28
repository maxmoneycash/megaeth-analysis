use std::collections::VecDeque;
use std::time::{Duration, Instant};

/// MegaETH protocol limits (from mega-evm constants)
pub mod limits {
    /// Block gas limit
    pub const BLOCK_GAS_LIMIT: u64 = 30_000_000;
    /// Block KV update limit
    pub const BLOCK_KV_UPDATE_LIMIT: u64 = 500_000;
    /// Block transaction size limit (bytes)
    pub const BLOCK_TX_SIZE_LIMIT: u64 = 1_000_000;
    /// Block DA size limit (bytes)
    pub const BLOCK_DA_SIZE_LIMIT: u64 = 1_000_000;
    /// Block data size limit (bytes)
    pub const BLOCK_DATA_LIMIT: u64 = 10_000_000;
    /// Block state growth limit
    pub const BLOCK_STATE_GROWTH_LIMIT: u64 = 100_000;
}

/// Sample of a single block's metrics for rolling statistics
#[derive(Debug, Clone, Copy)]
pub struct MetricSample {
    pub timestamp: Instant,
    pub total_gas: u64,
    pub kv_updates: u64,
    pub tx_size: u64,
    pub da_size: u64,
    pub data_size: u64,
    pub state_growth: u64,
}

/// Percentile statistics for a single metric
#[derive(Debug, Clone, Copy, Default)]
pub struct PercentileStats {
    pub p10: u64,
    pub p25: u64,
    pub median: u64,
    pub p75: u64,
    pub p90: u64,
    pub iqr: u64,  // p75 - p25
    pub min: u64,
    pub max: u64,
    pub count: usize,
}

/// All percentile stats for all metrics
#[derive(Debug, Clone, Default)]
pub struct AllMetricStats {
    pub gas: PercentileStats,
    pub kv_updates: PercentileStats,
    pub tx_size: PercentileStats,
    pub da_size: PercentileStats,
    pub data_size: PercentileStats,
    pub state_growth: PercentileStats,
}

/// Normalized metric value (-100 to +100)
#[derive(Debug, Clone, Copy)]
pub struct NormalizedMetric {
    /// Raw value
    pub raw: u64,
    /// Normalized score from -100 to +100
    pub score: f64,
    /// Utilization as percentage of protocol limit (0-100)
    pub utilization_pct: f64,
    /// Protocol limit for this metric
    pub limit: u64,
}

/// All normalized metrics for a block
#[derive(Debug, Clone)]
pub struct NormalizedBlockMetrics {
    pub gas: NormalizedMetric,
    pub kv_updates: NormalizedMetric,
    pub tx_size: NormalizedMetric,
    pub da_size: NormalizedMetric,
    pub data_size: NormalizedMetric,
    pub state_growth: NormalizedMetric,
}

/// Rolling statistics calculator using reservoir sampling
pub struct RollingStats {
    /// Window duration (default 10 minutes)
    window_duration: Duration,
    /// Maximum samples to keep (for memory efficiency)
    max_samples: usize,
    /// Samples stored as a deque for efficient removal of old entries
    samples: VecDeque<MetricSample>,
}

impl RollingStats {
    /// Create a new RollingStats with 10 minute window and 2000 max samples
    pub fn new() -> Self {
        Self {
            window_duration: Duration::from_secs(10 * 60), // 10 minutes
            max_samples: 2000,
            samples: VecDeque::with_capacity(2000),
        }
    }

    /// Create with custom parameters
    pub fn with_params(window_duration: Duration, max_samples: usize) -> Self {
        Self {
            window_duration,
            max_samples,
            samples: VecDeque::with_capacity(max_samples),
        }
    }

    /// Add a new block sample
    pub fn add_sample(&mut self, sample: MetricSample) {
        // Remove samples older than window
        self.evict_old();

        // If at capacity, use reservoir sampling
        if self.samples.len() >= self.max_samples {
            // Replace a random sample (simplified: replace oldest)
            self.samples.pop_front();
        }

        self.samples.push_back(sample);
    }

    /// Add sample from raw values
    pub fn add_block(
        &mut self,
        total_gas: u64,
        kv_updates: u64,
        tx_size: u64,
        da_size: u64,
        data_size: u64,
        state_growth: u64,
    ) {
        self.add_sample(MetricSample {
            timestamp: Instant::now(),
            total_gas,
            kv_updates,
            tx_size,
            da_size,
            data_size,
            state_growth,
        });
    }

    /// Remove samples older than window duration
    fn evict_old(&mut self) {
        let cutoff = Instant::now() - self.window_duration;
        while let Some(front) = self.samples.front() {
            if front.timestamp < cutoff {
                self.samples.pop_front();
            } else {
                break;
            }
        }
    }

    /// Get number of samples in the window
    pub fn sample_count(&self) -> usize {
        self.samples.len()
    }

    /// Compute percentile stats for all metrics
    pub fn compute_stats(&self) -> AllMetricStats {
        if self.samples.is_empty() {
            return AllMetricStats::default();
        }

        AllMetricStats {
            gas: self.compute_percentiles(|s| s.total_gas),
            kv_updates: self.compute_percentiles(|s| s.kv_updates),
            tx_size: self.compute_percentiles(|s| s.tx_size),
            da_size: self.compute_percentiles(|s| s.da_size),
            data_size: self.compute_percentiles(|s| s.data_size),
            state_growth: self.compute_percentiles(|s| s.state_growth),
        }
    }

    /// Compute percentiles for a single metric
    fn compute_percentiles<F>(&self, extractor: F) -> PercentileStats
    where
        F: Fn(&MetricSample) -> u64,
    {
        let mut values: Vec<u64> = self.samples.iter().map(&extractor).collect();

        if values.is_empty() {
            return PercentileStats::default();
        }

        values.sort_unstable();
        let n = values.len();

        let p10 = values[n * 10 / 100];
        let p25 = values[n * 25 / 100];
        let median = values[n * 50 / 100];
        let p75 = values[n * 75 / 100];
        let p90 = values[n * 90 / 100];

        PercentileStats {
            p10,
            p25,
            median,
            p75,
            p90,
            iqr: p75.saturating_sub(p25),
            min: values[0],
            max: values[n - 1],
            count: n,
        }
    }

    /// Normalize a block's metrics to -100 to +100 scores
    pub fn normalize_block(
        &self,
        total_gas: u64,
        kv_updates: u64,
        tx_size: u64,
        da_size: u64,
        data_size: u64,
        state_growth: u64,
    ) -> NormalizedBlockMetrics {
        let stats = self.compute_stats();

        NormalizedBlockMetrics {
            gas: normalize_metric(
                total_gas,
                &stats.gas,
                limits::BLOCK_GAS_LIMIT,
            ),
            kv_updates: normalize_metric(
                kv_updates,
                &stats.kv_updates,
                limits::BLOCK_KV_UPDATE_LIMIT,
            ),
            tx_size: normalize_metric(
                tx_size,
                &stats.tx_size,
                limits::BLOCK_TX_SIZE_LIMIT,
            ),
            da_size: normalize_metric(
                da_size,
                &stats.da_size,
                limits::BLOCK_DA_SIZE_LIMIT,
            ),
            data_size: normalize_metric(
                data_size,
                &stats.data_size,
                limits::BLOCK_DATA_LIMIT,
            ),
            state_growth: normalize_metric(
                state_growth,
                &stats.state_growth,
                limits::BLOCK_STATE_GROWTH_LIMIT,
            ),
        }
    }
}

impl Default for RollingStats {
    fn default() -> Self {
        Self::new()
    }
}

/// Normalize a single metric using Hybrid Sigmoid + Capacity Warning
///
/// Formula:
/// 1. Base score = tanh((value - median) / (IQR * 1.5)) * 100
/// 2. If utilization > 50%, override: score = max(score, utilization * 100)
///
/// Returns score in range -100 to +100
fn normalize_metric(value: u64, stats: &PercentileStats, protocol_limit: u64) -> NormalizedMetric {
    let utilization = value as f64 / protocol_limit as f64;
    let utilization_pct = utilization * 100.0;

    // Handle edge case: no data or no spread
    if stats.count == 0 || stats.iqr == 0 {
        // Fallback: just use utilization
        return NormalizedMetric {
            raw: value,
            score: (utilization * 200.0 - 100.0).clamp(-100.0, 100.0),
            utilization_pct,
            limit: protocol_limit,
        };
    }

    // Sigmoid normalization centered on median
    let spread = (stats.iqr as f64) * 1.5;
    let x = (value as f64 - stats.median as f64) / spread;
    let mut score = x.tanh() * 100.0;

    // Capacity warning: if approaching protocol limit, force towards +100
    if utilization > 0.5 {
        // Override with utilization-based score if higher
        let capacity_score = utilization * 100.0;
        score = score.max(capacity_score);
    }

    NormalizedMetric {
        raw: value,
        score: score.clamp(-100.0, 100.0),
        utilization_pct,
        limit: protocol_limit,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_metric_at_median() {
        let stats = PercentileStats {
            p10: 100,
            p25: 200,
            median: 500,
            p75: 800,
            p90: 1000,
            iqr: 600,
            min: 50,
            max: 1200,
            count: 100,
        };

        let result = normalize_metric(500, &stats, 1_000_000);
        assert!((result.score - 0.0).abs() < 1.0, "Median should be ~0");
    }

    #[test]
    fn test_normalize_metric_above_median() {
        let stats = PercentileStats {
            p10: 100,
            p25: 200,
            median: 500,
            p75: 800,
            p90: 1000,
            iqr: 600,
            min: 50,
            max: 1200,
            count: 100,
        };

        let result = normalize_metric(1100, &stats, 1_000_000);
        assert!(result.score > 50.0, "Above p90 should be high positive");
    }

    #[test]
    fn test_normalize_metric_below_median() {
        let stats = PercentileStats {
            p10: 100,
            p25: 200,
            median: 500,
            p75: 800,
            p90: 1000,
            iqr: 600,
            min: 50,
            max: 1200,
            count: 100,
        };

        let result = normalize_metric(100, &stats, 1_000_000);
        assert!(result.score < -30.0, "Below p10 should be negative");
    }

    #[test]
    fn test_capacity_warning_override() {
        let stats = PercentileStats {
            p10: 100,
            p25: 200,
            median: 500,
            p75: 800,
            p90: 1000,
            iqr: 600,
            min: 50,
            max: 1200,
            count: 100,
        };

        // 70% utilization should trigger capacity warning
        let result = normalize_metric(700_000, &stats, 1_000_000);
        assert!(result.score >= 70.0, "High utilization should force high score");
    }
}
