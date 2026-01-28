use anyhow::Result;
use chrono::{DateTime, Utc};

use super::client::QuestDBReader;
use super::models::{BlockBucket, BlockHistoryResponse, DeploymentHeatmapCell, DeploymentHeatmapView};

impl QuestDBReader {
    /// Get block production history for a specific window
    /// Uses QuestDB's native SAMPLE BY for time-series aggregation
    pub async fn get_block_history(&self, window: &str) -> Result<BlockHistoryResponse> {
        // #region agent log
        use std::fs::OpenOptions;
        use std::io::Write;
        // Check for data gaps in QuestDB for last 2 hours
        let gap_query = r#"
            WITH block_gaps AS (
                SELECT 
                    block_number,
                    timestamp,
                    block_number - lag(block_number) OVER (ORDER BY block_number) AS gap
                FROM block_production
                WHERE timestamp >= dateadd('h', -2, now())
                ORDER BY block_number
            )
            SELECT block_number, timestamp, gap
            FROM block_gaps
            WHERE gap > 1 AND gap IS NOT NULL
            LIMIT 10
        "#;
        
        let mut detected_gaps = Vec::new();
        if let Ok(gap_rows) = self.client().query(gap_query, &[]).await {
            for row in gap_rows {
                let block_num: i64 = row.get(0);
                let ts_sys: std::time::SystemTime = row.get(1);
                let ts: DateTime<Utc> = ts_sys.into();
                let gap: i64 = row.get(2);
                detected_gaps.push(serde_json::json!({
                    "block_number": block_num,
                    "timestamp": ts.to_rfc3339(),
                    "gap_size": gap
                }));
            }
        }
        
        if let Ok(row) = self.client().query_one("SELECT max(block_number), max(timestamp), count() FROM block_production WHERE timestamp >= dateadd('h', -2, now())", &[]).await {
            let max_block: Option<i64> = row.get(0);
            let max_ts_sys: Option<std::time::SystemTime> = row.get(1);
            let max_ts: Option<DateTime<Utc>> = max_ts_sys.map(|sys| sys.into());
            let block_count: i64 = row.get(2);
            
            if let Ok(mut file) = OpenOptions::new()
                .create(true)
                .append(true)
                .open("/Users/leena/Documents/GitHub/MegaViz/.cursor/debug.log")
            {
                let entry = serde_json::json!({
                    "sessionId": "debug-session",
                    "runId": "post-fix",
                    "hypothesisId": "H6",
                    "location": "queries.rs:get_block_history:gap_check",
                    "message": "QuestDB gap analysis (last 2h)",
                    "data": {
                        "window": window,
                        "max_block_number": max_block,
                        "max_timestamp": max_ts.map(|dt| dt.to_rfc3339()),
                        "block_count_last_2h": block_count,
                        "detected_gaps": detected_gaps,
                        "current_time": Utc::now().to_rfc3339()
                    },
                    "timestamp": Utc::now().timestamp_millis(),
                });
                let _ = writeln!(file, "{}", entry);
            }
        }
        // #endregion

        // Match sample interval and lookback period for each window
        let (sample_interval, lookback_hours) = match window {
            "1m" => ("1m", 2),      // Last 2 hours
            "5m" => ("5m", 12),     // Last 12 hours
            "15m" => ("15m", 24),   // Last 24 hours
            "1h" => ("1h", 168),    // Last 7 days
            "6h" => ("6h", 720),    // Last 30 days
            "24h" => ("1d", 2160),  // Last 90 days
            "7d" => ("7d", 8760),   // Last 1 year
            _ => return Err(anyhow::anyhow!("Invalid window: {}", window)),
        };

        // Query only recent data appropriate for this window
        let query = format!(
            r#"
            SELECT
                timestamp,
                count() as evm_blocks,
                sum(mini_block_count) as mini_blocks
            FROM block_production
            WHERE timestamp >= dateadd('h', -{}, now())
            SAMPLE BY {} FILL(0,0)
            "#,
            lookback_hours,
            sample_interval
        );

        let rows = self.client().query(&query, &[]).await?;

        let mut buckets = Vec::new();
        let mut total_evm = 0u64;
        let mut total_mini = 0u64;

        for row in rows {
            // QuestDB returns timestamps as SystemTime
            let timestamp_sys: std::time::SystemTime = row.get(0);
            let timestamp: DateTime<Utc> = timestamp_sys.into();
            let evm_blocks: i64 = row.get(1);
            let mini_blocks: i64 = row.get(2);

            let evm_blocks = evm_blocks as u64;
            let mini_blocks = mini_blocks as u64;

            total_evm += evm_blocks;
            total_mini += mini_blocks;

            buckets.push(BlockBucket {
                timestamp: timestamp.timestamp_millis(),
                evm_blocks,
                mini_blocks,
                is_complete: timestamp < Utc::now(),
            });
        }

        // #region agent log
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open("/Users/leena/Documents/GitHub/MegaViz/.cursor/debug.log")
        {
            let first_3: Vec<_> = buckets.iter().take(3).map(|b| {
                serde_json::json!({
                    "ts": b.timestamp,
                    "iso": DateTime::<Utc>::from_timestamp_millis(b.timestamp).map(|dt| dt.to_rfc3339()).unwrap_or_default(),
                    "evm": b.evm_blocks,
                    "mini": b.mini_blocks
                })
            }).collect();
            let last_3: Vec<_> = buckets.iter().rev().take(3).rev().map(|b| {
                serde_json::json!({
                    "ts": b.timestamp,
                    "iso": DateTime::<Utc>::from_timestamp_millis(b.timestamp).map(|dt| dt.to_rfc3339()).unwrap_or_default(),
                    "evm": b.evm_blocks,
                    "mini": b.mini_blocks
                })
            }).collect();
            let entry = serde_json::json!({
                "sessionId": "debug-session",
                "runId": "pre-fix",
                "hypothesisId": "H1",
                "location": "queries.rs:get_block_history:buckets_collected",
                "message": "QuestDB buckets collected",
                "data": {
                    "window": window,
                    "bucket_count": buckets.len(),
                    "sample_interval": sample_interval,
                    "first_3_buckets": first_3,
                    "last_3_buckets": last_3,
                    "total_evm": total_evm,
                    "total_mini": total_mini
                },
                "timestamp": Utc::now().timestamp_millis(),
            });
            let _ = writeln!(file, "{}", entry);
        }
        // #endregion

        Ok(BlockHistoryResponse {
            window: window.to_string(),
            buckets,
            total_evm_blocks: total_evm,
            total_mini_blocks: total_mini,
        })
    }

    /// Get deployment heatmap data
    pub async fn get_deployment_heatmap(
        &self,
        view: DeploymentHeatmapView,
    ) -> Result<Vec<DeploymentHeatmapCell>> {
        let query = match view {
            DeploymentHeatmapView::Daily => {
                // 24 hours × 14 days
                r#"
                SELECT
                    dateadd('h', hour(timestamp), date_trunc('day', timestamp)) as bucket,
                    count() as contracts_deployed,
                    count(DISTINCT deployer_address) as unique_deployers,
                    avg(code_size_bytes) as avg_contract_size,
                    approx_percentile(code_size_bytes, 0.95) as p95_contract_size,
                    sum(code_size_bytes) as total_code_bytes,
                    sum(gas_used) as total_deploy_gas,
                    avg(gas_used) as avg_deploy_gas
                FROM contract_deployments
                WHERE timestamp >= dateadd('d', -14, now())
                GROUP BY bucket
                ORDER BY bucket DESC
                "#
            }
            DeploymentHeatmapView::Weekly => {
                // 7 weekdays × 12 weeks
                r#"
                SELECT
                    date_trunc('week', timestamp) as bucket,
                    count() as contracts_deployed,
                    count(DISTINCT deployer_address) as unique_deployers,
                    avg(code_size_bytes) as avg_contract_size,
                    approx_percentile(code_size_bytes, 0.95) as p95_contract_size,
                    sum(code_size_bytes) as total_code_bytes,
                    sum(gas_used) as total_deploy_gas,
                    avg(gas_used) as avg_deploy_gas
                FROM contract_deployments
                WHERE timestamp >= dateadd('w', -12, now())
                GROUP BY bucket
                ORDER BY bucket DESC
                "#
            }
            DeploymentHeatmapView::Monthly => {
                // 31 days × 12 months
                // Group by day within each month to create a proper grid
                r#"
                SELECT
                    date_trunc('day', timestamp) as bucket,
                    count() as contracts_deployed,
                    count(DISTINCT deployer_address) as unique_deployers,
                    avg(code_size_bytes) as avg_contract_size,
                    approx_percentile(code_size_bytes, 0.95) as p95_contract_size,
                    sum(code_size_bytes) as total_code_bytes,
                    sum(gas_used) as total_deploy_gas,
                    avg(gas_used) as avg_deploy_gas
                FROM contract_deployments
                WHERE timestamp >= dateadd('M', -12, now())
                GROUP BY bucket
                ORDER BY bucket ASC
                "#
            }
        };

        let rows = self.client().query(query, &[]).await?;

        let mut cells = Vec::new();

        for row in rows {
            let timestamp_sys: std::time::SystemTime = row.get(0);
            let timestamp: DateTime<Utc> = timestamp_sys.into();
            let contracts_deployed: i64 = row.get(1);
            let unique_deployers: i64 = row.get(2);
            let avg_contract_size: Option<f64> = row.get(3);
            let p95_contract_size: Option<f64> = row.get(4);
            let total_code_bytes: Option<i64> = row.get(5);
            let total_deploy_gas: Option<i64> = row.get(6);
            let avg_deploy_gas: Option<f64> = row.get(7);

            cells.push(DeploymentHeatmapCell {
                timestamp,
                contracts_deployed: contracts_deployed as u64,
                unique_deployers: unique_deployers as u64,
                avg_contract_size: avg_contract_size.unwrap_or(0.0),
                p95_contract_size: p95_contract_size.unwrap_or(0.0),
                total_code_bytes: total_code_bytes.unwrap_or(0) as u64,
                total_deploy_gas: total_deploy_gas.unwrap_or(0) as u64,
                avg_deploy_gas: avg_deploy_gas.unwrap_or(0.0),
                contract_addresses: Vec::new(), // Will need a separate query for full details
                deployer_addresses: Vec::new(),
                contract_types: Vec::new(),
            });
        }

        Ok(cells)
    }

    /// Get detailed deployment info for a specific time bucket
    pub async fn get_deployment_details(
        &self,
        bucket_start: DateTime<Utc>,
        bucket_end: DateTime<Utc>,
    ) -> Result<Vec<(String, String, String)>> {
        let query = format!(
            r#"
            SELECT
                contract_address,
                deployer_address,
                contract_type
            FROM contract_deployments
            WHERE timestamp >= '{}' AND timestamp < '{}'
            ORDER BY timestamp ASC
            "#,
            bucket_start.format("%Y-%m-%dT%H:%M:%S%.6fZ"),
            bucket_end.format("%Y-%m-%dT%H:%M:%S%.6fZ")
        );

        let rows = self.client().query(&query, &[]).await?;

        let mut details = Vec::new();
        for row in rows {
            let contract_address: String = row.get(0);
            let deployer_address: String = row.get(1);
            let contract_type: String = row.get(2);
            details.push((contract_address, deployer_address, contract_type));
        }

        Ok(details)
    }

    /// Get total deployment count
    pub async fn get_total_deployments(&self) -> Result<u64> {
        let query = "SELECT count() FROM contract_deployments";
        let row = self.client().query_one(query, &[]).await?;
        let count: i64 = row.get(0);
        Ok(count as u64)
    }

    /// Get total block count in QuestDB
    pub async fn get_total_blocks(&self) -> Result<u64> {
        let query = "SELECT count() FROM block_production";
        let row = self.client().query_one(query, &[]).await?;
        let count: i64 = row.get(0);
        Ok(count as u64)
    }

    /// Get latest block number in QuestDB
    pub async fn get_latest_block_number(&self) -> Result<Option<u64>> {
        let query = "SELECT max(block_number) FROM block_production";
        let row = self.client().query_one(query, &[]).await?;
        let block_number: Option<i64> = row.get(0);
        Ok(block_number.map(|n| n as u64))
    }

    /// Get earliest block number in QuestDB
    pub async fn get_earliest_block_number(&self) -> Result<Option<u64>> {
        let query = "SELECT min(block_number) FROM block_production";
        let row = self.client().query_one(query, &[]).await?;
        let block_number: Option<i64> = row.get(0);
        Ok(block_number.map(|n| n as u64))
    }
}
