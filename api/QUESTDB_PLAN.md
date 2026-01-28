# QuestDB Integration Plan for MegaViz

## TL;DR

**Do we need it?** Not immediately. Your current in-memory Rust API works great for real-time data. QuestDB adds **persistence** and **historical queries** (7-day lookback) without losing speed.

**Why QuestDB?** It's the fastest time-series database for exactly what we're doing: rolling window aggregations on blockchain metrics. 25ms query times vs 500ms+ on traditional databases.

---

## What We Have Now (Working)

```
┌─────────────────────────────────────────────────────────┐
│                    Current Architecture                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   MegaETH RPC ──poll──▶ Rust API ──stream──▶ Frontend  │
│        │                    │                           │
│        │               [In-Memory]                      │
│        │                VecDeque                        │
│        │              (60k blocks)                      │
│        │                    │                           │
│        └────────────────────┘                           │
│                                                         │
│   Pros:                                                 │
│   ✅ Fast (everything in RAM)                          │
│   ✅ Simple (no external dependencies)                 │
│   ✅ Working right now                                 │
│                                                         │
│   Cons:                                                 │
│   ❌ Data lost on restart                              │
│   ❌ Limited to ~10 min history (60k blocks)           │
│   ❌ No historical queries beyond RAM window           │
│   ❌ Can't backfill 7 days of data                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## What QuestDB Adds

```
┌─────────────────────────────────────────────────────────┐
│                   QuestDB Architecture                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   MegaETH RPC ──poll──▶ Rust API ──stream──▶ Frontend  │
│        │                    │                           │
│        │                    ▼                           │
│        │              ┌─────────┐                       │
│        │              │ QuestDB │ ◀── Historical        │
│        │              │  (ILP)  │     Queries           │
│        │              └─────────┘                       │
│        │                    │                           │
│        │              [Persistent]                      │
│        │              7+ days data                      │
│        │                    │                           │
│        └────────────────────┘                           │
│                                                         │
│   Adds:                                                 │
│   ✅ Data survives restarts                            │
│   ✅ 7-day historical queries                          │
│   ✅ Native SAMPLE BY for time windows                 │
│   ✅ 1.4M rows/sec ingestion                           │
│   ✅ 25ms aggregation queries                          │
│   ✅ Backfill on startup                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Why QuestDB Over Alternatives

| Feature | QuestDB | SQLite | PostgreSQL | ClickHouse |
|---------|---------|--------|------------|------------|
| Time-series native | ✅ | ❌ | ❌ | ✅ |
| Query speed (agg) | 25ms | 200ms+ | 500ms+ | 100ms |
| Ingestion speed | 1.4M/s | 50k/s | 100k/s | 500k/s |
| `SAMPLE BY` clause | ✅ | ❌ | ❌ | ❌ |
| Setup complexity | Low | Low | Medium | High |
| Docker one-liner | ✅ | N/A | ✅ | ✅ |
| Memory footprint | ~500MB | ~10MB | ~200MB | ~1GB |

**QuestDB wins because:**
1. Native time-series operations (`SAMPLE BY 1h`, `LATEST ON`)
2. Fastest aggregation queries for our data shape
3. Simple setup (single Docker container)
4. InfluxDB Line Protocol for fast writes

---

## Implementation Plan

### Phase 1: Setup (30 min)

**1.1 Start QuestDB**
```bash
docker run -d \
  --name questdb \
  -p 9000:9000 \
  -p 9009:9009 \
  -p 8812:8812 \
  -v questdb_data:/var/lib/questdb \
  questdb/questdb
```

Ports:
- `9000` - Web console & REST API
- `9009` - InfluxDB Line Protocol (fast writes)
- `8812` - PostgreSQL wire protocol (queries)

**1.2 Create Tables**
```sql
-- Block-level metrics (1 row per block)
CREATE TABLE block_metrics (
  timestamp TIMESTAMP,
  block_number LONG,
  block_hash SYMBOL,
  tx_count INT,
  total_gas LONG,
  compute_gas LONG,
  storage_gas LONG,
  tx_size LONG,
  da_size LONG,
  data_size LONG,
  kv_updates LONG,
  state_growth LONG,
  gas_limit LONG
) TIMESTAMP(timestamp) PARTITION BY DAY;

-- Transaction-level metrics (1 row per tx)
CREATE TABLE tx_metrics (
  timestamp TIMESTAMP,
  block_number LONG,
  tx_hash SYMBOL,
  from_addr SYMBOL,
  to_addr SYMBOL,
  function_selector SYMBOL,
  total_gas LONG,
  compute_gas LONG,
  storage_gas LONG,
  tx_size LONG,
  da_size LONG,
  data_size LONG,
  kv_updates LONG,
  state_growth LONG
) TIMESTAMP(timestamp) PARTITION BY DAY;

-- Contract aggregates (materialized view, updated hourly)
CREATE TABLE contract_stats (
  timestamp TIMESTAMP,
  contract_addr SYMBOL,
  tx_count LONG,
  total_gas LONG,
  avg_gas DOUBLE,
  top_function SYMBOL
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

### Phase 2: Rust Integration (2 hrs)

**2.1 Add Dependencies**
```toml
# Cargo.toml
[dependencies]
# QuestDB ILP client (fast writes)
questdb-rs = "4.0"
# PostgreSQL client (queries)
tokio-postgres = "0.7"
```

**2.2 Write Path (ILP - InfluxDB Line Protocol)**
```rust
use questdb::ingress::{Sender, Buffer, TimestampNanos};

pub struct QuestDBWriter {
    sender: Sender,
}

impl QuestDBWriter {
    pub async fn new() -> Result<Self> {
        let sender = Sender::from_conf("http::addr=localhost:9009;")?;
        Ok(Self { sender })
    }

    pub async fn write_block(&mut self, block: &BlockMetrics) -> Result<()> {
        let mut buffer = Buffer::new();

        buffer
            .table("block_metrics")?
            .symbol("block_hash", &block.block_hash)?
            .column_i64("block_number", block.block_number as i64)?
            .column_i64("tx_count", block.tx_count as i64)?
            .column_i64("total_gas", block.total_gas as i64)?
            .column_i64("compute_gas", block.compute_gas as i64)?
            .column_i64("storage_gas", block.storage_gas as i64)?
            .column_i64("tx_size", block.tx_size as i64)?
            .column_i64("da_size", block.da_size as i64)?
            .column_i64("data_size", block.data_size as i64)?
            .column_i64("kv_updates", block.kv_updates as i64)?
            .column_i64("state_growth", block.state_growth as i64)?
            .column_i64("gas_limit", block.gas_limit as i64)?
            .at(TimestampNanos::from_datetime(block.timestamp)?)?;

        self.sender.flush(&mut buffer).await?;
        Ok(())
    }
}
```

**2.3 Read Path (PostgreSQL Protocol)**
```rust
use tokio_postgres::{NoTls, Client};

pub struct QuestDBReader {
    client: Client,
}

impl QuestDBReader {
    pub async fn new() -> Result<Self> {
        let (client, connection) = tokio_postgres::connect(
            "host=localhost port=8812 user=admin password=quest dbname=qdb",
            NoTls,
        ).await?;

        tokio::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("QuestDB connection error: {}", e);
            }
        });

        Ok(Self { client })
    }

    /// Get stats for a time window using native SAMPLE BY
    pub async fn get_window_stats(&self, window: &str) -> Result<WindowStats> {
        let query = format!(r#"
            SELECT
                timestamp,
                sum(tx_count) as tx_count,
                avg(total_gas) as avg_gas,
                sum(total_gas) as sum_gas,
                max(total_gas) as max_gas,
                avg(kv_updates) as avg_kv,
                sum(kv_updates) as sum_kv,
                avg(da_size) as avg_da,
                count() as block_count
            FROM block_metrics
            WHERE timestamp > now() - interval '{}'
            SAMPLE BY {}
        "#, window, window);

        let rows = self.client.query(&query, &[]).await?;
        // ... parse rows into WindowStats
    }

    /// Get top contracts by gas usage
    pub async fn get_top_contracts(&self, window: &str, limit: i32) -> Result<Vec<ContractStats>> {
        let query = format!(r#"
            SELECT
                to_addr as contract,
                count() as tx_count,
                sum(total_gas) as total_gas,
                avg(total_gas) as avg_gas
            FROM tx_metrics
            WHERE timestamp > now() - interval '{}'
              AND to_addr IS NOT NULL
            GROUP BY to_addr
            ORDER BY total_gas DESC
            LIMIT {}
        "#, window, limit);

        let rows = self.client.query(&query, &[]).await?;
        // ... parse rows
    }

    /// Get top functions by gas usage
    pub async fn get_top_functions(&self, window: &str, limit: i32) -> Result<Vec<FunctionStats>> {
        let query = format!(r#"
            SELECT
                function_selector,
                count() as call_count,
                sum(total_gas) as total_gas,
                avg(total_gas) as avg_gas
            FROM tx_metrics
            WHERE timestamp > now() - interval '{}'
            GROUP BY function_selector
            ORDER BY total_gas DESC
            LIMIT {}
        "#, window, limit);

        let rows = self.client.query(&query, &[]).await?;
        // ... parse rows
    }
}
```

### Phase 3: Backfill (1 hr)

**3.1 Startup Backfill Logic**
```rust
pub async fn backfill_history(
    client: &MegaEthClient,
    writer: &mut QuestDBWriter,
    days: u64,
) -> Result<()> {
    let latest = client.get_latest_block_number().await?;
    let blocks_per_day = 86_400; // 1 block/sec
    let start_block = latest.saturating_sub(days * blocks_per_day);

    info!("Backfilling {} days ({} blocks)", days, latest - start_block);

    // Batch fetch blocks (100 at a time)
    for batch_start in (start_block..latest).step_by(100) {
        let batch_end = (batch_start + 100).min(latest);

        let blocks = futures::future::join_all(
            (batch_start..batch_end).map(|n| client.get_block(n))
        ).await;

        for block in blocks.into_iter().flatten().flatten() {
            let metrics = calculate_metrics(&block);
            writer.write_block(&metrics).await?;
        }

        info!("Backfilled blocks {}-{}", batch_start, batch_end);
    }

    Ok(())
}
```

### Phase 4: New API Endpoints (1 hr)

**4.1 Historical Query Endpoints**
```rust
// GET /stats/history?window=24h&sample=1h
// Returns hourly aggregates for last 24 hours
async fn get_history(
    Query(params): Query<HistoryParams>,
    State(db): State<QuestDBReader>,
) -> Json<Vec<WindowStats>> {
    let stats = db.get_sampled_stats(&params.window, &params.sample).await?;
    Json(stats)
}

// GET /contracts/top?window=1h&limit=20
// Returns top contracts by gas in last hour
async fn get_top_contracts(
    Query(params): Query<TopParams>,
    State(db): State<QuestDBReader>,
) -> Json<Vec<ContractStats>> {
    let contracts = db.get_top_contracts(&params.window, params.limit).await?;
    Json(contracts)
}

// GET /functions/top?window=1h&limit=20
// Returns top functions by gas in last hour
async fn get_top_functions(
    Query(params): Query<TopParams>,
    State(db): State<QuestDBReader>,
) -> Json<Vec<FunctionStats>> {
    let functions = db.get_top_functions(&params.window, params.limit).await?;
    Json(functions)
}
```

---

## Example Queries (The Good Stuff)

### Rolling Window Stats (Native!)
```sql
-- Hourly stats for last 7 days
SELECT
    timestamp,
    sum(tx_count) as txs,
    avg(total_gas) as avg_gas,
    max(total_gas) as max_gas
FROM block_metrics
WHERE timestamp > now() - 7d
SAMPLE BY 1h;
```

### Top Gas Consumers
```sql
-- Top 10 contracts by gas (last 24h)
SELECT
    to_addr,
    count() as txs,
    sum(total_gas) as gas,
    sum(total_gas) * 100.0 / (SELECT sum(total_gas) FROM tx_metrics WHERE timestamp > now() - 1d) as pct
FROM tx_metrics
WHERE timestamp > now() - 1d
GROUP BY to_addr
ORDER BY gas DESC
LIMIT 10;
```

### Function Breakdown
```sql
-- Gas by function selector (last hour)
SELECT
    function_selector,
    count() as calls,
    avg(total_gas) as avg_gas,
    sum(total_gas) as total_gas
FROM tx_metrics
WHERE timestamp > now() - 1h
GROUP BY function_selector
ORDER BY total_gas DESC;
```

### Spike Detection
```sql
-- Blocks with gas > 2x average
WITH avg_gas AS (
    SELECT avg(total_gas) as baseline
    FROM block_metrics
    WHERE timestamp > now() - 1h
)
SELECT *
FROM block_metrics
WHERE timestamp > now() - 1h
  AND total_gas > (SELECT baseline * 2 FROM avg_gas);
```

---

## Storage Estimates

| Timeframe | Blocks | Transactions | Storage |
|-----------|--------|--------------|---------|
| 1 day | 86,400 | ~1.2M | ~150 MB |
| 7 days | 604,800 | ~8.5M | ~1 GB |
| 30 days | 2.6M | ~36M | ~4 GB |

QuestDB compression typically achieves 10-15x, so actual disk usage will be lower.

---

## Decision Matrix

### Use Current In-Memory (No QuestDB) If:
- You only need real-time data (last 10 min)
- You don't care about data surviving restarts
- You want zero infrastructure
- You're just demoing/prototyping

### Add QuestDB If:
- You need 7-day historical queries
- You want data to persist across restarts
- You need per-contract/per-function aggregates
- You're deploying to production
- You want backfill capability

---

## Quick Start Commands

```bash
# 1. Start QuestDB
docker run -d --name questdb -p 9000:9000 -p 9009:9009 -p 8812:8812 questdb/questdb

# 2. Open web console
open http://localhost:9000

# 3. Create tables (paste SQL from above)

# 4. Update Rust API (add questdb-rs, tokio-postgres)

# 5. Run with QuestDB enabled
QUESTDB_ENABLED=true cargo run --release
```

---

## Summary

| Aspect | Without QuestDB | With QuestDB |
|--------|-----------------|--------------|
| Setup time | 0 | 30 min |
| Data persistence | ❌ | ✅ |
| Historical queries | 10 min | 7+ days |
| Query speed | Fast (RAM) | Fast (25ms) |
| Backfill | ❌ | ✅ |
| Infrastructure | None | 1 Docker container |
| Complexity | Low | Low-Medium |

**Recommendation:** Start with current in-memory for demo/dev. Add QuestDB when you need persistence and historical data for production.

---

## Resources

- [QuestDB Docs](https://questdb.io/docs/)
- [QuestDB Rust Client](https://github.com/questdb/c-questdb-client/tree/main/questdb-rs)
- [SAMPLE BY Reference](https://questdb.io/docs/reference/sql/sample-by/)
- [Time-series Benchmarks](https://questdb.io/blog/questdb-versus-timescaledb/)
