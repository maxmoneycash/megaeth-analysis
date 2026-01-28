//! Automated Contract Identification System
//!
//! This module automatically identifies which protocol/project a contract belongs to
//! by using multiple detection methods.

use alloy_primitives::{Address, Bytes};
use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;
use tracing::{debug, info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractInfo {
    pub name: String,
    pub symbol: String,
    pub category: String,
    pub confidence: f32, // 0.0 to 1.0
    pub source: String,  // Where we got this info from
}

/// Main contract identifier
pub struct ContractIdentifier {
    rpc_client: Client,
    rpc_url: String,
    block_explorer_api_key: Option<String>,
}

impl ContractIdentifier {
    pub fn new(rpc_url: String, block_explorer_api_key: Option<String>) -> Self {
        Self {
            rpc_client: Client::new(),
            rpc_url,
            block_explorer_api_key,
        }
    }

    /// Main identification pipeline - tries multiple methods
    pub async fn identify(&self, address: Address) -> Result<ContractInfo> {
        info!("Identifying contract: {:?}", address);

        // Method 1: Try RPC name/symbol functions (fastest, works for tokens)
        if let Ok(info) = self.try_rpc_name_symbol(address).await {
            info!("✅ Identified via RPC name/symbol: {}", info.name);
            return Ok(info);
        }

        // Method 2: Try block explorer API (most reliable if verified)
        if let Ok(info) = self.try_block_explorer(address).await {
            info!("✅ Identified via block explorer: {}", info.name);
            return Ok(info);
        }

        // Method 3: Try bytecode fingerprinting against known contracts
        if let Ok(info) = self.try_bytecode_fingerprint(address).await {
            info!("✅ Identified via bytecode fingerprint: {}", info.name);
            return Ok(info);
        }

        // Method 4: Try event signature analysis
        if let Ok(info) = self.try_event_signatures(address).await {
            info!("✅ Identified via event signatures: {}", info.name);
            return Ok(info);
        }

        // Fallback: Generate generic name
        warn!("❌ Could not identify contract: {:?}", address);
        Ok(self.generate_fallback_name(address))
    }

    /// Method 1: Query name() and symbol() functions via RPC
    async fn try_rpc_name_symbol(&self, address: Address) -> Result<ContractInfo> {
        // Function selectors
        const NAME_SELECTOR: &str = "0x06fdde03"; // name()
        const SYMBOL_SELECTOR: &str = "0x95d89b41"; // symbol()

        // Try calling name()
        let name = match self.eth_call(address, NAME_SELECTOR).await {
            Ok(result) => self.decode_string(&result)?,
            Err(_) => return Err(anyhow::anyhow!("name() call failed")),
        };

        // Try calling symbol()
        let symbol = match self.eth_call(address, SYMBOL_SELECTOR).await {
            Ok(result) => self.decode_string(&result)?,
            Err(_) => name[..4.min(name.len())].to_string(),
        };

        // Infer category from name
        let category = self.infer_category_from_name(&name);

        Ok(ContractInfo {
            name,
            symbol,
            category,
            confidence: 0.85,
            source: "RPC name/symbol".to_string(),
        })
    }

    /// Method 2: Query block explorer API for verified contracts
    async fn try_block_explorer(&self, address: Address) -> Result<ContractInfo> {
        // Note: MegaETH block explorer API endpoint would go here
        // Example for Etherscan-compatible APIs:

        let explorer_url = "https://explorer.megaeth.com/api"; // Placeholder

        if let Some(api_key) = &self.block_explorer_api_key {
            let url = format!(
                "{}?module=contract&action=getsourcecode&address={:?}&apikey={}",
                explorer_url, address, api_key
            );

            let response: BlockExplorerResponse = self.rpc_client
                .get(&url)
                .send()
                .await?
                .json()
                .await?;

            if let Some(contract_data) = response.result.first() {
                if !contract_data.contract_name.is_empty() {
                    // Parse contract name to extract protocol
                    let (project, contract_type) = self.parse_contract_name(&contract_data.contract_name);

                    // Analyze source code for additional info
                    let category = self.infer_category_from_source(&contract_data.source_code);

                    return Ok(ContractInfo {
                        name: project,
                        symbol: contract_type.chars().take(4).collect::<String>().to_uppercase(),
                        category,
                        confidence: 0.95,
                        source: "Block Explorer (verified)".to_string(),
                    });
                }
            }
        }

        Err(anyhow::anyhow!("Block explorer query failed"))
    }

    /// Method 3: Bytecode fingerprinting against known contracts
    async fn try_bytecode_fingerprint(&self, address: Address) -> Result<ContractInfo> {
        // Get contract bytecode
        let bytecode = self.get_code(address).await?;
        let bytecode_hash = keccak256(&bytecode);

        // Look up in known bytecode database
        if let Some(info) = KNOWN_BYTECODES.get().and_then(|db| db.get(&bytecode_hash)) {
            return Ok(ContractInfo {
                name: info.name.clone(),
                symbol: info.symbol.clone(),
                category: info.category.clone(),
                confidence: 0.98, // Very high confidence for exact bytecode match
                source: "Bytecode fingerprint".to_string(),
            });
        }

        // Try partial bytecode matching (for contracts with constructor params)
        if let Some(info) = self.try_partial_bytecode_match(&bytecode).await? {
            return Ok(info);
        }

        Err(anyhow::anyhow!("No bytecode match found"))
    }

    /// Method 4: Analyze event signatures from recent transactions
    async fn try_event_signatures(&self, address: Address) -> Result<ContractInfo> {
        // This would require fetching recent transactions and analyzing event logs
        // Placeholder for now
        Err(anyhow::anyhow!("Event signature analysis not implemented"))
    }

    /// Helper: Make eth_call RPC request
    async fn eth_call(&self, to: Address, data: &str) -> Result<String> {
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "eth_call",
            "params": [{
                "to": format!("{:?}", to),
                "data": data
            }, "latest"],
            "id": 1
        });

        let response: serde_json::Value = self.rpc_client
            .post(&self.rpc_url)
            .json(&payload)
            .send()
            .await?
            .json()
            .await?;

        Ok(response["result"]
            .as_str()
            .context("Invalid RPC response")?
            .to_string())
    }

    /// Helper: Get contract bytecode
    async fn get_code(&self, address: Address) -> Result<Bytes> {
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "eth_getCode",
            "params": [format!("{:?}", address), "latest"],
            "id": 1
        });

        let response: serde_json::Value = self.rpc_client
            .post(&self.rpc_url)
            .json(&payload)
            .send()
            .await?
            .json()
            .await?;

        let hex_code = response["result"]
            .as_str()
            .context("Invalid RPC response")?;

        Ok(Bytes::from(hex::decode(&hex_code[2..]).context("Invalid hex")?))
    }

    /// Helper: Decode ABI-encoded string
    fn decode_string(&self, hex_data: &str) -> Result<String> {
        // Strip 0x prefix
        let data = hex::decode(&hex_data[2..])?;

        if data.len() < 64 {
            return Err(anyhow::anyhow!("Data too short"));
        }

        // String offset is at position 0-32
        // String length is at position 32-64
        let length = u32::from_be_bytes([data[60], data[61], data[62], data[63]]) as usize;

        if data.len() < 64 + length {
            return Err(anyhow::anyhow!("Data length mismatch"));
        }

        // String content starts at position 64
        let string_bytes = &data[64..64 + length];
        Ok(String::from_utf8_lossy(string_bytes).to_string())
    }

    /// Helper: Infer category from contract/token name
    fn infer_category_from_name(&self, name: &str) -> String {
        let name_lower = name.to_lowercase();

        if name_lower.contains("oracle") || name_lower.contains("feed") || name_lower.contains("price") {
            return "oracle".to_string();
        }
        if name_lower.contains("bridge") || name_lower.contains("portal") {
            return "bridge".to_string();
        }
        if name_lower.contains("swap") || name_lower.contains("pool") || name_lower.contains("dex") {
            return "dex".to_string();
        }
        if name_lower.contains("lend") || name_lower.contains("borrow") || name_lower.contains("aave") {
            return "lending".to_string();
        }
        if name_lower.contains("vault") || name_lower.contains("strategy") {
            return "defi".to_string();
        }
        if name_lower.contains("nft") || name_lower.contains("721") || name_lower.contains("1155") {
            return "nft".to_string();
        }

        "other".to_string()
    }

    /// Helper: Parse contract name to extract protocol and type
    fn parse_contract_name(&self, name: &str) -> (String, String) {
        // Examples:
        // "UniswapV3Pool" -> ("Uniswap V3", "Pool")
        // "ChainlinkAggregator" -> ("Chainlink", "Aggregator")
        // "AaveV3Pool" -> ("Aave V3", "Pool")

        // Try to split on common patterns
        let parts: Vec<&str> = name.split(|c: char| c.is_uppercase() && c != name.chars().next().unwrap())
            .filter(|s| !s.is_empty())
            .collect();

        if parts.len() >= 2 {
            (parts[0].to_string(), parts.last().unwrap().to_string())
        } else {
            (name.to_string(), "Contract".to_string())
        }
    }

    /// Helper: Infer category from source code analysis
    fn infer_category_from_source(&self, source: &str) -> String {
        // Look for import statements and comments
        if source.contains("@uniswap") || source.contains("@sushiswap") {
            return "dex".to_string();
        }
        if source.contains("@chainlink") || source.contains("AggregatorV3Interface") {
            return "oracle".to_string();
        }
        if source.contains("@layerzero") {
            return "bridge".to_string();
        }
        if source.contains("@aave") || source.contains("@compound") {
            return "lending".to_string();
        }

        "other".to_string()
    }

    /// Helper: Try partial bytecode matching (for contracts with constructor params)
    async fn try_partial_bytecode_match(&self, bytecode: &Bytes) -> Result<Option<ContractInfo>> {
        // This would compare bytecode prefixes/suffixes against known patterns
        // Placeholder for now
        Ok(None)
    }

    /// Fallback: Generate generic name from address
    fn generate_fallback_name(&self, address: Address) -> ContractInfo {
        ContractInfo {
            name: format!("Contract {}", &format!("{:?}", address)[2..8].to_uppercase()),
            symbol: format!("{}", &format!("{:?}", address)[2..6].to_uppercase()),
            category: "other".to_string(),
            confidence: 0.1,
            source: "Fallback".to_string(),
        }
    }
}

// Known bytecode database (in production, this would be loaded from a file/database)
static KNOWN_BYTECODES: OnceLock<HashMap<[u8; 32], ContractInfo>> = OnceLock::new();

fn keccak256(data: &[u8]) -> [u8; 32] {
    use sha3::{Digest, Keccak256};
    let mut hasher = Keccak256::new();
    hasher.update(data);
    hasher.finalize().into()
}

#[derive(Debug, Deserialize)]
struct BlockExplorerResponse {
    result: Vec<ContractData>,
}

#[derive(Debug, Deserialize)]
struct ContractData {
    #[serde(rename = "ContractName")]
    contract_name: String,
    #[serde(rename = "SourceCode")]
    source_code: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_identify_erc20() {
        let identifier = ContractIdentifier::new(
            "https://mainnet.megaeth.com/rpc".to_string(),
            None,
        );

        // This would test with a known ERC-20 contract
        // let info = identifier.identify(address).await.unwrap();
        // assert_eq!(info.category, "other"); // or specific category
    }
}
