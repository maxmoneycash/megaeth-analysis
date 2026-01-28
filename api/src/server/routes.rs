use axum::{
    routing::get,
    Router,
};
use std::sync::Arc;
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use super::handlers::{self, AppState};
use crate::metrics::MetricsStore;
use crate::rpc::BlockEvent;

/// Create the API router with all routes
pub fn create_router(
    store: Arc<MetricsStore>,
    block_tx: broadcast::Sender<BlockEvent>,
) -> Router {
    let state = Arc::new(AppState { store, block_tx });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        // Health check
        .route("/health", get(handlers::health))
        // Window statistics
        .route("/stats/window", get(handlers::get_window_stats))
        // Block endpoints
        .route("/blocks/{block_number}", get(handlers::get_block))
        .route("/blocks/recent", get(handlers::get_recent_blocks))
        // Visualization endpoints (optimized for frontend)
        .route("/viz/ring", get(handlers::get_ring_data))
        .route("/viz/dials", get(handlers::get_dial_data))
        // WebSocket for real-time block streaming
        .route("/ws/blocks", get(handlers::ws_blocks))
        // Add middleware
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
