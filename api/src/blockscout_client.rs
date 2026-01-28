//! MegaETH Blockscout API Client
//!
//! Client for interacting with MegaETH's Blockscout block explorer API
//! https://megaeth.blockscout.com/api-docs

use anyhow::{Context, Result};
use alloy_primitives::Address;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{debug, info, warn};

#[derive(Clone)]
pub struct BlockscoutClient {
    client: Client,
    base_url: String,
}

#[derive(Debug, Deserialize)]
pub struct ContractSourceResponse {
    pub status: String,
    pub message: String,
    pub result: Vec<ContractSource>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct ContractSource {
    pub source_code: String,
    #[serde(rename = "ABI")]
    pub abi: String,
    pub contract_name: String,
    pub compiler_version: String,
    pub optimization_used: String,
    pub runs: String,
    pub constructor_arguments: String,
    #[serde(rename = "EVMVersion")]
    pub evm_version: String,
    pub library: String,
    pub license_type: String,
    pub proxy: String,
    pub implementation: String,
    pub swarm_source: String,
}

#[derive(Debug, Deserialize)]
pub struct TransactionListResponse {
    pub status: String,
    pub message: String,
    pub result: Vec<Transaction>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub block_number: String,
    pub time_stamp: String,
    pub hash: String,
    pub from: String,
    pub to: String,
    pub value: String,
    pub gas: String,
    pub gas_price: String,
    pub is_error: String,
    pub input: String,
    pub contract_address: String,
}

#[derive(Debug, Deserialize)]
pub struct ContractCreationResponse {
    pub status: String,
    pub message: String,
    pub result: Vec<ContractCreation>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContractCreation {
    pub contract_address: String,
    pub contract_creator: String,
    pub tx_hash: String,
}

impl BlockscoutClient {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .expect("Failed to create HTTP client"),
            base_url: "https://megaeth.blockscout.com/api".to_string(),
        }
    }

    /// Check if a contract is verified on Blockscout
    pub async fn is_verified(&self, address: Address) -> Result<bool> {
        let source = self.get_source_code(address).await?;
        Ok(!source.source_code.is_empty() && source.source_code != "Contract source code not verified")
    }

    /// Get verified source code for a contract
    pub async fn get_source_code(&self, address: Address) -> Result<ContractSource> {
        let url = format!(
            "{}?module=contract&action=getsourcecode&address={:?}",
            self.base_url, address
        );

        debug!("Fetching source code from Blockscout: {}", url);

        let response: ContractSourceResponse = self.client
            .get(&url)
            .send()
            .await
            .context("Failed to fetch from Blockscout")?
            .json()
            .await
            .context("Failed to parse Blockscout response")?;

        if response.status != "1" {
            anyhow::bail!("Blockscout API error: {}", response.message);
        }

        response.result
            .into_iter()
            .next()
            .context("No contract data returned")
    }

    /// Get contract creation transaction details
    pub async fn get_contract_creation(&self, address: Address) -> Result<ContractCreation> {
        let url = format!(
            "{}?module=contract&action=getcontractcreation&contractaddresses={:?}",
            self.base_url, address
        );

        debug!("Fetching contract creation from Blockscout: {}", url);

        let response: ContractCreationResponse = self.client
            .get(&url)
            .send()
            .await
            .context("Failed to fetch from Blockscout")?
            .json()
            .await
            .context("Failed to parse Blockscout response")?;

        if response.status != "1" {
            anyhow::bail!("Blockscout API error: {}", response.message);
        }

        response.result
            .into_iter()
            .next()
            .context("No contract creation data")
    }

    /// Get recent transactions for a contract
    pub async fn get_transactions(
        &self,
        address: Address,
        limit: usize,
    ) -> Result<Vec<Transaction>> {
        let url = format!(
            "{}?module=account&action=txlist&address={:?}&startblock=0&endblock=99999999&page=1&offset={}&sort=desc",
            self.base_url, address, limit
        );

        debug!("Fetching transactions from Blockscout: {}", url);

        let response: TransactionListResponse = self.client
            .get(&url)
            .send()
            .await
            .context("Failed to fetch from Blockscout")?
            .json()
            .await
            .context("Failed to parse Blockscout response")?;

        if response.status != "1" {
            // Empty result is OK
            if response.message.contains("No transactions found") {
                return Ok(vec![]);
            }
            anyhow::bail!("Blockscout API error: {}", response.message);
        }

        Ok(response.result)
    }

    /// Extract project name from verified source code
    pub fn extract_project_name(&self, source: &ContractSource) -> Option<String> {
        // Strategy 1: Parse from import statements
        if let Some(project) = self.extract_from_imports(&source.source_code) {
            return Some(project);
        }

        // Strategy 2: Parse from comments
        if let Some(project) = self.extract_from_comments(&source.source_code) {
            return Some(project);
        }

        // Strategy 3: Use contract name
        if !source.contract_name.is_empty() {
            return Some(self.clean_contract_name(&source.contract_name));
        }

        None
    }

    /// Extract project from import statements
    fn extract_from_imports(&self, source_code: &str) -> Option<String> {
        // Look for imports like: import "@uniswap/v3-core/..."
        let imports = vec![
            ("@uniswap/v3", "Uniswap V3"),
            ("@uniswap/v2", "Uniswap V2"),
            ("@chainlink/", "Chainlink"),
            ("@openzeppelin/", "OpenZeppelin"),
            ("@aave/", "Aave"),
            ("@layerzero/", "LayerZero"),
            ("solady/", "Solady"),
        ];

        for (pattern, project) in imports {
            if source_code.contains(pattern) {
                return Some(project.to_string());
            }
        }

        None
    }

    /// Extract project from comments
    fn extract_from_comments(&self, source_code: &str) -> Option<String> {
        // Look for comments like: // @title Uniswap V3 Pool
        let lines: Vec<&str> = source_code.lines().take(50).collect(); // Check first 50 lines

        for line in lines {
            let line_lower = line.to_lowercase();

            if line_lower.contains("@title") || line_lower.contains("@notice") {
                // Extract after @title or @notice
                if let Some(title) = line.split("@title").nth(1) {
                    return Some(title.trim().to_string());
                }
                if let Some(notice) = line.split("@notice").nth(1) {
                    return Some(notice.trim().to_string());
                }
            }

            // Check for common patterns
            if line_lower.contains("uniswap") {
                return Some("Uniswap".to_string());
            }
            if line_lower.contains("chainlink") {
                return Some("Chainlink".to_string());
            }
            if line_lower.contains("aave") {
                return Some("Aave".to_string());
            }
        }

        None
    }

    /// Clean up contract name (e.g., "UniswapV3Pool" -> "Uniswap V3")
    fn clean_contract_name(&self, name: &str) -> String {
        // Remove common suffixes
        let cleaned = name
            .replace("Contract", "")
            .replace("Implementation", "")
            .trim()
            .to_string();

        // Insert spaces before capital letters
        let mut result = String::new();
        for (i, c) in cleaned.chars().enumerate() {
            if i > 0 && c.is_uppercase() {
                result.push(' ');
            }
            result.push(c);
        }

        result.trim().to_string()
    }

    /// Infer contract category from source code
    pub fn infer_category(&self, source: &ContractSource) -> String {
        let source_lower = source.source_code.to_lowercase();
        let name_lower = source.contract_name.to_lowercase();

        // Check for common patterns
        if source_lower.contains("erc20") || name_lower.contains("token") {
            return "token".to_string();
        }
        if source_lower.contains("erc721") || source_lower.contains("erc1155") {
            return "nft".to_string();
        }
        if source_lower.contains("swap") || source_lower.contains("pool") || name_lower.contains("dex") {
            return "dex".to_string();
        }
        if source_lower.contains("oracle") || source_lower.contains("feed") || source_lower.contains("price") {
            return "oracle".to_string();
        }
        if source_lower.contains("bridge") || source_lower.contains("portal") {
            return "bridge".to_string();
        }
        if source_lower.contains("lending") || source_lower.contains("borrow") {
            return "lending".to_string();
        }
        if source_lower.contains("vault") || source_lower.contains("strategy") {
            return "defi".to_string();
        }
        if source_lower.contains("game") || source_lower.contains("nft") {
            return "gaming".to_string();
        }

        "other".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_blockscout_client() {
        let client = BlockscoutClient::new();

        // Test with a known contract (Oracle)
        let address: Address = "0x6342000000000000000000000000000000000001"
            .parse()
            .unwrap();

        // This might fail if contract isn't verified yet
        if let Ok(source) = client.get_source_code(address).await {
            println!("Contract name: {}", source.contract_name);
            println!("Compiler: {}", source.compiler_version);
        }
    }

    #[test]
    fn test_clean_contract_name() {
        let client = BlockscoutClient::new();

        assert_eq!(client.clean_contract_name("UniswapV3Pool"), "Uniswap V3 Pool");
        assert_eq!(client.clean_contract_name("ChainlinkAggregator"), "Chainlink Aggregator");
        assert_eq!(client.clean_contract_name("ERC20Token"), "ERC20 Token");
    }
}
