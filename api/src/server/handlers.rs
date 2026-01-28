use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;

use crate::metrics::{BlockMetrics, MetricsStore, WindowStats};
use crate::rpc::BlockEvent;

/// Application state shared across handlers
pub struct AppState {
    pub store: Arc<MetricsStore>,
    pub block_tx: broadcast::Sender<BlockEvent>,
}

/// Query parameters for window stats
#[derive(Debug, Deserialize)]
pub struct WindowQuery {
    /// Window size in seconds (default: 60)
    #[serde(default = "default_window")]
    pub seconds: u64,
}

fn default_window() -> u64 {
    60
}

/// Query parameters for recent blocks
#[derive(Debug, Deserialize)]
pub struct RecentBlocksQuery {
    /// Number of blocks to return (default: 100)
    #[serde(default = "default_count")]
    pub count: usize,
}

fn default_count() -> usize {
    100
}

/// Health check response
#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub last_block: u64,
}

/// Get health status
pub async fn health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    let last_block = state.store.last_block_number().await;
    Json(HealthResponse {
        status: "ok".to_string(),
        last_block,
    })
}

/// Get window statistics
pub async fn get_window_stats(
    State(state): State<Arc<AppState>>,
    Query(query): Query<WindowQuery>,
) -> Json<WindowStats> {
    let stats = state.store.get_window_stats(query.seconds).await;
    Json(stats)
}

/// Get a specific block's metrics
pub async fn get_block(
    State(state): State<Arc<AppState>>,
    Path(block_number): Path<u64>,
) -> Result<Json<BlockMetrics>, StatusCode> {
    match state.store.get_block(block_number).await {
        Some(block) => Ok(Json(block)),
        None => Err(StatusCode::NOT_FOUND),
    }
}

/// Get recent blocks
pub async fn get_recent_blocks(
    State(state): State<Arc<AppState>>,
    Query(query): Query<RecentBlocksQuery>,
) -> Json<Vec<BlockMetrics>> {
    let blocks = state.store.get_recent_blocks(query.count).await;
    Json(blocks)
}

/// Ring visualization data (optimized for the activity ring)
#[derive(Serialize)]
pub struct RingData {
    /// Gas usage normalized (0-1, relative to block gas limit)
    pub gas_normalized: f64,
    /// KV updates normalized (0-1, relative to typical max)
    pub kv_normalized: f64,
    /// Compute vs storage ratio (0-1, where 1 = all compute)
    pub compute_ratio: f64,
    /// Activity level for color (0-1)
    pub activity_level: f64,
    /// Raw metrics for display
    pub total_gas: u64,
    pub compute_gas: u64,
    pub storage_gas: u64,
    pub kv_updates: u64,
    pub da_size: u64,
    pub tx_count: u64,
    pub block_count: u64,
}

/// Typical max values for normalization
const TYPICAL_MAX_GAS_PER_BLOCK: f64 = 30_000_000.0;
const TYPICAL_MAX_KV_PER_BLOCK: f64 = 1000.0;

/// Get ring visualization data (optimized endpoint)
pub async fn get_ring_data(
    State(state): State<Arc<AppState>>,
    Query(query): Query<WindowQuery>,
) -> Json<RingData> {
    let stats = state.store.get_window_stats(query.seconds).await;

    let gas_normalized = (stats.mean_total_gas / TYPICAL_MAX_GAS_PER_BLOCK).min(1.0);
    let kv_normalized = (stats.mean_kv_updates / TYPICAL_MAX_KV_PER_BLOCK).min(1.0);

    let compute_ratio = if stats.mean_total_gas > 0.0 {
        stats.mean_compute_gas / stats.mean_total_gas
    } else {
        0.5
    };

    // Activity level based on multiple factors
    let activity_level = (gas_normalized * 0.5 + kv_normalized * 0.3 + compute_ratio * 0.2).min(1.0);

    Json(RingData {
        gas_normalized,
        kv_normalized,
        compute_ratio,
        activity_level,
        total_gas: stats.sum_total_gas,
        compute_gas: stats.sum_compute_gas,
        storage_gas: stats.sum_storage_gas,
        kv_updates: stats.sum_kv_updates,
        da_size: stats.sum_da_size,
        tx_count: stats.tx_count,
        block_count: stats.block_count,
    })
}

/// Dial visualization data (for dual compute/storage dials)
#[derive(Serialize)]
pub struct DialData {
    /// Compute gas metrics
    pub compute: DialMetrics,
    /// Storage gas metrics
    pub storage: DialMetrics,
    /// Overall metrics
    pub total_gas: u64,
    pub block_count: u64,
    pub tx_count: u64,
}

#[derive(Serialize)]
pub struct DialMetrics {
    /// Mean value per block
    pub mean: f64,
    /// P95 value
    pub p95: u64,
    /// Max value
    pub max: u64,
    /// Total sum
    pub sum: u64,
    /// Normalized value (0-1)
    pub normalized: f64,
}

/// Typical max values for dial normalization
const TYPICAL_MAX_COMPUTE_GAS: f64 = 20_000_000.0;
const TYPICAL_MAX_STORAGE_GAS: f64 = 10_000_000.0;

/// Get dial visualization data
pub async fn get_dial_data(
    State(state): State<Arc<AppState>>,
    Query(query): Query<WindowQuery>,
) -> Json<DialData> {
    let stats = state.store.get_window_stats(query.seconds).await;

    Json(DialData {
        compute: DialMetrics {
            mean: stats.mean_compute_gas,
            p95: stats.p95_compute_gas,
            max: stats.max_compute_gas,
            sum: stats.sum_compute_gas,
            normalized: (stats.mean_compute_gas / TYPICAL_MAX_COMPUTE_GAS).min(1.0),
        },
        storage: DialMetrics {
            mean: stats.mean_storage_gas,
            p95: stats.p95_storage_gas,
            max: stats.max_storage_gas,
            sum: stats.sum_storage_gas,
            normalized: (stats.mean_storage_gas / TYPICAL_MAX_STORAGE_GAS).min(1.0),
        },
        total_gas: stats.sum_total_gas,
        block_count: stats.block_count,
        tx_count: stats.tx_count,
    })
}

/// WebSocket handler for real-time block streaming
pub async fn ws_blocks(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_ws_connection(socket, state))
}

/// Handle a WebSocket connection
async fn handle_ws_connection(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();

    // Subscribe to block events
    let mut block_rx = state.block_tx.subscribe();

    // Spawn task to send blocks to client
    let send_task = tokio::spawn(async move {
        while let Ok(event) = block_rx.recv().await {
            let json = match serde_json::to_string(&event) {
                Ok(j) => j,
                Err(_) => continue,
            };

            if sender.send(Message::Text(json.into())).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages (for ping/pong and close)
    let recv_task = tokio::spawn(async move {
        while let Some(msg) = receiver.next().await {
            match msg {
                Ok(Message::Close(_)) => break,
                Ok(Message::Ping(data)) => {
                    // Pong is handled automatically by axum
                    let _ = data;
                }
                Err(_) => break,
                _ => {}
            }
        }
    });

    // Wait for either task to complete
    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }
}
