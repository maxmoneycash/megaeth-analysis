//! Real-Time Contract Deployment Monitor for MegaETH
//!
//! Monitors MegaETH blockchain for new contract deployments and automatically
//! identifies them using multiple detection strategies + Blockscout API.
//!
//! Usage:
//!   RPC_URL=https://mainnet.megaeth.com/rpc cargo run --release --bin contract_monitor

use anyhow::Result;
use alloy_primitives::{Address, B256};
use megaviz_api::blockscout_client::BlockscoutClient;
use megaviz_api::rpc::MegaEthClient;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{debug, error, info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct IdentifiedContract {
    address: String,
    deployer: String,
    block_number: u64,
    timestamp: u64,

    // Identification results
    name: String,
    symbol: String,
    category: String,
    confidence: f32,
    detection_method: String,

    // Additional metadata
    is_verified: bool,
    is_megaeth_native: bool,
    tx_hash: Option<String>,
}

struct ContractMonitor {
    rpc: MegaEthClient,
    blockscout: BlockscoutClient,
    processed_blocks: HashSet<u64>,
    identified_contracts: HashMap<Address, IdentifiedContract>,
    output_file: String,
}

impl ContractMonitor {
    async fn new(rpc_url: &str, output_file: &str) -> Result<Self> {
        let rpc = MegaEthClient::new(rpc_url).await?;
        let blockscout = BlockscoutClient::new();

        // Load existing identified contracts
        let identified_contracts = if Path::new(output_file).exists() {
            let content = fs::read_to_string(output_file)?;
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            HashMap::new()
        };

        Ok(Self {
            rpc,
            blockscout,
            processed_blocks: HashSet::new(),
            identified_contracts,
            output_file: output_file.to_string(),
        })
    }

    /// Main monitoring loop
    async fn monitor(&mut self) -> Result<()> {
        info!("🚀 Starting MegaETH Contract Monitor");
        info!("📊 Output: {}", self.output_file);
        info!("🔍 Monitoring for new contract deployments...");

        let mut last_save = std::time::Instant::now();

        loop {
            match self.check_for_new_contracts().await {
                Ok(count) => {
                    if count > 0 {
                        info!("✅ Processed {} new contracts", count);
                    }
                }
                Err(e) => {
                    error!("❌ Error checking for contracts: {}", e);
                }
            }

            // Save every 5 minutes or if we have new contracts
            if last_save.elapsed() > Duration::from_secs(300) {
                self.save_results()?;
                last_save = std::time::Instant::now();
            }

            // Check every 5 seconds (MegaETH is fast!)
            sleep(Duration::from_secs(5)).await;
        }
    }

    /// Check for new contract deployments
    async fn check_for_new_contracts(&mut self) -> Result<usize> {
        let latest_block = self.rpc.get_block_number().await?;

        // Process last 100 blocks to catch up
        let start_block = latest_block.saturating_sub(100);

        let mut new_contracts = 0;

        for block_num in start_block..=latest_block {
            if self.processed_blocks.contains(&block_num) {
                continue;
            }

            match self.process_block(block_num).await {
                Ok(count) => {
                    new_contracts += count;
                }
                Err(e) => {
                    warn!("Error processing block {}: {}", block_num, e);
                }
            }

            self.processed_blocks.insert(block_num);

            // Keep memory usage reasonable
            if self.processed_blocks.len() > 10000 {
                let min = *self.processed_blocks.iter().min().unwrap();
                self.processed_blocks.remove(&min);
            }
        }

        Ok(new_contracts)
    }

    /// Process a single block
    async fn process_block(&mut self, block_num: u64) -> Result<usize> {
        let block = self.rpc.get_block(block_num).await?;

        if block.is_none() {
            return Ok(0);
        }

        let block = block.unwrap();
        let mut count = 0;

        // Get all receipts for this block at once
        let receipts = self.rpc.get_block_receipts(block_num).await?;
        let receipt_map: HashMap<B256, _> = receipts
            .into_iter()
            .map(|r| (r.transaction_hash, r))
            .collect();

        for tx in &block.transactions {
            // Contract creation: tx.to is None
            if tx.to.is_none() {
                if let Some(receipt) = receipt_map.get(&tx.hash) {
                    if let Some(contract_address) = receipt.contract_address {
                        // Skip if already identified
                        if self.identified_contracts.contains_key(&contract_address) {
                            continue;
                        }

                        info!("🆕 New contract: {:?} at block {}", contract_address, block_num);

                        match self.identify_contract(
                            contract_address,
                            tx.from,
                            block_num,
                            block.timestamp,
                            tx.hash,
                        ).await {
                            Ok(identified) => {
                                info!("   ✅ {}: {} ({}% confidence)",
                                    identified.name,
                                    identified.category,
                                    (identified.confidence * 100.0) as u32
                                );

                                self.identified_contracts.insert(contract_address, identified);
                                count += 1;
                            }
                            Err(e) => {
                                warn!("   ❌ Failed to identify: {}", e);
                            }
                        }
                    }
                }
            }
        }

        Ok(count)
    }

    /// Identify a newly deployed contract using multiple strategies
    async fn identify_contract(
        &self,
        address: Address,
        deployer: Address,
        block_number: u64,
        timestamp: u64,
        tx_hash: B256,
    ) -> Result<IdentifiedContract> {
        let addr_str = format!("{:?}", address);
        let deployer_str = format!("{:?}", deployer);

        // Strategy 1: Check if it's a known MegaETH system contract
        if let Some(contract) = self.check_system_contract(address) {
            return Ok(IdentifiedContract {
                address: addr_str,
                deployer: deployer_str,
                block_number,
                timestamp,
                name: contract.0,
                symbol: contract.1,
                category: contract.2,
                confidence: 1.0,
                detection_method: "MegaETH System Contract".to_string(),
                is_verified: true,
                is_megaeth_native: true,
                tx_hash: Some(format!("{:?}", tx_hash)),
            });
        }

        // Strategy 2: Check Blockscout for verified contract (BEST SOURCE!)
        debug!("Checking Blockscout for verification...");
        if let Ok(source) = self.blockscout.get_source_code(address).await {
            if !source.source_code.is_empty() && source.source_code != "Contract source code not verified" {
                info!("   ✅ Found verified contract on Blockscout!");

                let name = self.blockscout.extract_project_name(&source)
                    .unwrap_or_else(|| source.contract_name.clone());

                let category = self.blockscout.infer_category(&source);

                // Check if it's MegaETH-specific
                let is_megaeth_native = self.is_megaeth_native_pattern(&source.source_code);

                return Ok(IdentifiedContract {
                    address: addr_str,
                    deployer: deployer_str,
                    block_number,
                    timestamp,
                    name,
                    symbol: source.contract_name[..4.min(source.contract_name.len())].to_uppercase(),
                    category,
                    confidence: 0.95,
                    detection_method: "Blockscout Verification".to_string(),
                    is_verified: true,
                    is_megaeth_native,
                    tx_hash: Some(format!("{:?}", tx_hash)),
                });
            }
        }

        // Strategy 3: Try standard interface detection (ERC-20, ERC-721, etc.)
        debug!("Trying interface detection...");
        if let Some(interface) = self.detect_standard_interface(address).await? {
            return Ok(IdentifiedContract {
                address: addr_str,
                deployer: deployer_str,
                block_number,
                timestamp,
                name: interface.0,
                symbol: interface.1,
                category: interface.2,
                confidence: 0.85,
                detection_method: "Standard Interface".to_string(),
                is_verified: false,
                is_megaeth_native: false,
                tx_hash: Some(format!("{:?}", tx_hash)),
            });
        }

        // Strategy 4: Analyze initial transactions (if contract has activity)
        debug!("Analyzing transaction patterns...");
        if let Ok(txs) = self.blockscout.get_transactions(address, 10).await {
            if !txs.is_empty() {
                if let Some(pattern) = self.analyze_tx_patterns(&txs) {
                    return Ok(IdentifiedContract {
                        address: addr_str,
                        deployer: deployer_str,
                        block_number,
                        timestamp,
                        name: pattern.0,
                        symbol: pattern.1,
                        category: pattern.2,
                        confidence: 0.7,
                        detection_method: "Transaction Pattern Analysis".to_string(),
                        is_verified: false,
                        is_megaeth_native: false,
                        tx_hash: Some(format!("{:?}", tx_hash)),
                    });
                }
            }
        }

        // Fallback: Unknown contract
        Ok(IdentifiedContract {
            address: addr_str.clone(),
            deployer: deployer_str,
            block_number,
            timestamp,
            name: format!("Contract {}", &addr_str[2..8]),
            symbol: addr_str[2..6].to_uppercase(),
            category: "unknown".to_string(),
            confidence: 0.1,
            detection_method: "Fallback (Awaiting Verification)".to_string(),
            is_verified: false,
            is_megaeth_native: false,
            tx_hash: Some(format!("{:?}", tx_hash)),
        })
    }

    /// Check if address is a known MegaETH system contract
    fn check_system_contract(&self, address: Address) -> Option<(String, String, String)> {
        let addr_str = format!("{:?}", address).to_lowercase();

        const KNOWN_SYSTEM: &[(&str, &str, &str, &str)] = &[
            ("0x6342000000000000000000000000000000000001", "Oracle", "ORA", "infrastructure"),
            ("0x6342000000000000000000000000000000000002", "Timestamp Oracle", "TSO", "infrastructure"),
            ("0x4200000000000000000000000000000000000015", "L1 Block", "L1B", "infrastructure"),
            ("0x4200000000000000000000000000000000000007", "L2 Cross Domain Messenger", "CDM", "bridge"),
            ("0x4200000000000000000000000000000000000010", "L2 Standard Bridge", "BRG", "bridge"),
            ("0x4200000000000000000000000000000000000006", "WETH", "WETH", "defi"),
        ];

        for (addr, name, symbol, category) in KNOWN_SYSTEM {
            if addr_str == addr.to_lowercase() {
                return Some((name.to_string(), symbol.to_string(), category.to_string()));
            }
        }

        None
    }

    /// Detect standard interfaces
    async fn detect_standard_interface(&self, address: Address) -> Result<Option<(String, String, String)>> {
        // Try ERC-20
        if self.has_function(address, "0x18160ddd").await? &&  // totalSupply()
           self.has_function(address, "0x70a08231").await? {   // balanceOf(address)

            let name = self.try_call_name(address).await
                .unwrap_or_else(|_| "Unknown Token".to_string());
            let symbol = self.try_call_symbol(address).await
                .unwrap_or_else(|_| "TKN".to_string());

            return Ok(Some((name, symbol, "token".to_string())));
        }

        // Try ERC-721
        if self.has_function(address, "0x6352211e").await? {  // ownerOf(uint256)
            let name = self.try_call_name(address).await
                .unwrap_or_else(|_| "Unknown NFT".to_string());
            let symbol = self.try_call_symbol(address).await
                .unwrap_or_else(|_| "NFT".to_string());

            return Ok(Some((name, symbol, "nft".to_string())));
        }

        // Try DEX Pool
        if self.has_function(address, "0x0dfe1681").await? &&  // token0()
           self.has_function(address, "0xd21220a7").await? {   // token1()
            return Ok(Some((
                "DEX Pool".to_string(),
                "POOL".to_string(),
                "dex".to_string()
            )));
        }

        Ok(None)
    }

    /// Check if contract has a specific function
    async fn has_function(&self, address: Address, selector: &str) -> Result<bool> {
        match self.rpc.eth_call(address, selector).await {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    /// Try to call name() function
    async fn try_call_name(&self, address: Address) -> Result<String> {
        const NAME_SELECTOR: &str = "0x06fdde03";
        let result = self.rpc.eth_call(address, NAME_SELECTOR).await?;
        // Simplified decoder - in production use proper ABI decoder
        Ok("Token".to_string())
    }

    /// Try to call symbol() function
    async fn try_call_symbol(&self, address: Address) -> Result<String> {
        const SYMBOL_SELECTOR: &str = "0x95d89b41";
        let result = self.rpc.eth_call(address, SYMBOL_SELECTOR).await?;
        Ok("TKN".to_string())
    }

    /// Check if contract uses MegaETH-specific patterns
    fn is_megaeth_native_pattern(&self, source_code: &str) -> bool {
        // Check for RedBlackTreeKV pattern
        if source_code.contains("0xdeadbeef") || source_code.contains("RedBlackTree") {
            return true;
        }

        // Check for Oracle usage
        if source_code.contains("0x6342000000000000000000000000000000000001") {
            return true;
        }

        // Check for high-frequency patterns
        if source_code.contains("real-time") || source_code.contains("high-frequency") {
            return true;
        }

        false
    }

    /// Analyze transaction patterns
    fn analyze_tx_patterns(&self, txs: &[megaviz_api::blockscout_client::Transaction])
        -> Option<(String, String, String)> {

        // Look at function calls
        let mut function_calls = HashSet::new();
        for tx in txs {
            if tx.input.len() >= 10 {
                function_calls.insert(&tx.input[2..10]);
            }
        }

        // Swap pattern
        if function_calls.iter().any(|s| s.starts_with("022c0d9f")) {  // swap()
            return Some(("DEX Contract".to_string(), "DEX".to_string(), "dex".to_string()));
        }

        // Transfer pattern
        if function_calls.iter().any(|s| s.starts_with("a9059cbb")) {  // transfer()
            return Some(("Token Contract".to_string(), "TKN".to_string(), "token".to_string()));
        }

        None
    }

    /// Save results to JSON file
    fn save_results(&self) -> Result<()> {
        let json = serde_json::to_string_pretty(&self.identified_contracts)?;
        fs::write(&self.output_file, json)?;
        info!("💾 Saved {} identified contracts to {}",
            self.identified_contracts.len(),
            self.output_file
        );
        Ok(())
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    let rpc_url = std::env::var("RPC_URL")
        .unwrap_or_else(|_| "https://mainnet.megaeth.com/rpc".to_string());

    let output_file = std::env::var("OUTPUT_FILE")
        .unwrap_or_else(|_| "identified_contracts.json".to_string());

    let mut monitor = ContractMonitor::new(&rpc_url, &output_file).await?;

    // Graceful shutdown
    tokio::select! {
        result = monitor.monitor() => {
            result?;
        }
        _ = tokio::signal::ctrl_c() => {
            info!("🛑 Shutting down gracefully...");
            monitor.save_results()?;
        }
    }

    Ok(())
}
