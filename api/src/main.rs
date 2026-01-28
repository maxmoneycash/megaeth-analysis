use std::net::SocketAddr;
use std::time::Duration;
use anyhow::{Context, Result};
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tracing::{info, Level};
use tracing_subscriber::EnvFilter;

use megaviz_api::metrics::MetricsStore;
use megaviz_api::rpc::{BlockEvent, BlockPoller, MegaEthClient};
use megaviz_api::server::create_router;

/// Default configuration
const DEFAULT_RPC_URL: &str = "https://carrot.megaeth.com/rpc";
const DEFAULT_PORT: u16 = 3001;
const DEFAULT_POLL_INTERVAL_MS: u64 = 1000;
const DEFAULT_CONFIRMATION_BLOCKS: u64 = 5;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive(Level::INFO.into())
                .add_directive("megaviz_api=debug".parse().unwrap()),
        )
        .init();

    // Load configuration from environment
    dotenvy::dotenv().ok();

    let rpc_url = std::env::var("MEGAETH_RPC_URL")
        .unwrap_or_else(|_| DEFAULT_RPC_URL.to_string());
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(DEFAULT_PORT);
    let poll_interval_ms: u64 = std::env::var("POLL_INTERVAL_MS")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(DEFAULT_POLL_INTERVAL_MS);
    let confirmation_blocks: u64 = std::env::var("CONFIRMATION_BLOCKS")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(DEFAULT_CONFIRMATION_BLOCKS);

    info!("MegaViz API starting...");
    info!("RPC URL: {}", rpc_url);
    info!("Port: {}", port);
    info!("Poll interval: {}ms", poll_interval_ms);
    info!("Confirmation blocks: {}", confirmation_blocks);

    // Initialize components
    let client = MegaEthClient::new(&rpc_url)
        .await
        .context("Failed to create MegaETH client")?;

    // Verify connection
    let chain_id = client.get_chain_id().await?;
    info!("Connected to chain ID: {}", chain_id);

    let store = MetricsStore::new();

    // Create broadcast channel for real-time block updates
    let (block_tx, _) = broadcast::channel::<BlockEvent>(100);

    // Create and start the block poller
    let poller = BlockPoller::new(
        MegaEthClient::new(&rpc_url).await?,
        store.clone(),
        confirmation_blocks,
        Duration::from_millis(poll_interval_ms),
        block_tx.clone(),
    );

    // Spawn the poller task
    tokio::spawn(async move {
        poller.run().await;
    });

    // Create the HTTP server
    let router = create_router(store, block_tx);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr).await?;

    info!("API server listening on http://{}", addr);
    info!("");
    info!("Endpoints:");
    info!("  GET /health              - Health check");
    info!("  GET /stats/window        - Window statistics (query: seconds=60)");
    info!("  GET /blocks/:number      - Get block metrics");
    info!("  GET /blocks/recent       - Get recent blocks (query: count=100)");
    info!("  GET /viz/ring            - Ring visualization data");
    info!("  GET /viz/dials           - Dial visualization data");
    info!("  WS  /ws/blocks           - Real-time block stream");

    axum::serve(listener, router).await?;

    Ok(())
}
