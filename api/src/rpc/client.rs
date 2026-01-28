use alloy_primitives::{Address, Bytes, B256, U256};
use anyhow::{Context, Result};
use reqwest::Client;
use serde_json::{json, Value};

/// Raw block data from MegaETH RPC
#[derive(Debug, Clone)]
pub struct RawBlock {
    pub number: u64,
    pub hash: B256,
    pub gas_used: u64,
    pub gas_limit: u64,
    pub timestamp: u64,
    pub extra_data: Bytes,
    pub mini_block_count: u64,  // Direct from RPC
    pub transactions: Vec<RawTransaction>,
}

/// Raw transaction data from MegaETH RPC
#[derive(Debug, Clone)]
pub struct RawTransaction {
    pub hash: B256,
    pub from: Address,
    pub to: Option<Address>,
    pub input: Bytes,
    pub gas: u64,
    pub tx_type: u8,
    pub nonce: u64,
    pub value: U256,
    pub gas_price: Option<u128>,
    pub max_fee_per_gas: Option<u128>,
    pub max_priority_fee_per_gas: Option<u128>,
    pub chain_id: Option<u64>,
    pub v: u64,
    pub r: U256,
    pub s: U256,
    pub access_list: Vec<(Address, Vec<B256>)>,
}

impl RawTransaction {
    /// Calculate EIP-2718 encoded size
    pub fn encoded_size(&self) -> u64 {
        // Base size: signature (65) + nonce (1-9) + gas (1-9) + to (21) + value (1-32)
        let mut size: u64 = 0;

        // Signature: v (1) + r (32) + s (32) = 65 bytes
        size += 65;

        // Nonce: 1-9 bytes RLP
        size += rlp_uint_size(self.nonce);

        // Gas limit: 1-9 bytes RLP
        size += rlp_uint_size(self.gas);

        // To address: 21 bytes (1 length + 20 address) or 1 byte for empty
        size += if self.to.is_some() { 21 } else { 1 };

        // Value: 1-33 bytes RLP
        size += rlp_u256_size(self.value);

        // Input data: length prefix + data
        let input_len = self.input.len() as u64;
        size += rlp_length_prefix_size(input_len) + input_len;

        // Gas price fields based on tx type
        match self.tx_type {
            0 => {
                // Legacy: gasPrice
                size += rlp_u128_size(self.gas_price.unwrap_or(0));
            }
            1 => {
                // EIP-2930: gasPrice + accessList
                size += rlp_u128_size(self.gas_price.unwrap_or(0));
                size += self.access_list_size();
                size += 1; // tx type byte
            }
            2 => {
                // EIP-1559: maxPriorityFeePerGas + maxFeePerGas + accessList
                size += rlp_u128_size(self.max_priority_fee_per_gas.unwrap_or(0));
                size += rlp_u128_size(self.max_fee_per_gas.unwrap_or(0));
                size += self.access_list_size();
                size += 1; // tx type byte
            }
            126 => {
                // Deposit tx (L1->L2)
                size += 1; // tx type byte
                // Deposit txs have additional fields but we approximate
                size += 100; // sourceHash, mint, isSystemTx overhead
            }
            _ => {
                // Unknown type, use gas price
                size += rlp_u128_size(self.gas_price.unwrap_or(0));
            }
        }

        // Chain ID for non-legacy
        if self.tx_type > 0 && self.chain_id.is_some() {
            size += rlp_uint_size(self.chain_id.unwrap_or(0));
        }

        // RLP list overhead (1-3 bytes)
        size += 3;

        size
    }

    /// Calculate access list RLP size
    fn access_list_size(&self) -> u64 {
        if self.access_list.is_empty() {
            return 1; // Empty list
        }

        let mut size: u64 = 0;
        for (addr, keys) in &self.access_list {
            size += 21; // Address
            size += 1 + (keys.len() as u64 * 33); // Keys list
        }
        size + rlp_length_prefix_size(size)
    }

    /// Get bytes for DA size calculation
    pub fn to_bytes_for_da(&self) -> Vec<u8> {
        // Reconstruct approximate transaction bytes for FastLZ compression
        let mut bytes = Vec::with_capacity(self.encoded_size() as usize);

        // Type byte for typed transactions
        if self.tx_type > 0 {
            bytes.push(self.tx_type);
        }

        // Add input data (main contributor to size)
        bytes.extend_from_slice(&self.input);

        // Add signature bytes
        bytes.extend_from_slice(&[0u8; 65]);

        // Pad to approximate full tx size
        let target_size = self.encoded_size() as usize;
        if bytes.len() < target_size {
            bytes.resize(target_size, 0);
        }

        bytes
    }
}

/// Calculate RLP size for a u64
fn rlp_uint_size(val: u64) -> u64 {
    if val == 0 {
        1
    } else if val < 128 {
        1
    } else {
        1 + ((64 - val.leading_zeros()) as u64 + 7) / 8
    }
}

/// Calculate RLP size for a u128
fn rlp_u128_size(val: u128) -> u64 {
    if val == 0 {
        1
    } else if val < 128 {
        1
    } else {
        1 + ((128 - val.leading_zeros()) as u64 + 7) / 8
    }
}

/// Calculate RLP size for a U256
fn rlp_u256_size(val: U256) -> u64 {
    if val.is_zero() {
        1
    } else {
        let bytes = val.to_be_bytes::<32>();
        let leading_zeros = bytes.iter().take_while(|&&b| b == 0).count();
        let significant_bytes = 32 - leading_zeros;
        if significant_bytes == 1 && bytes[31] < 128 {
            1
        } else {
            1 + significant_bytes as u64
        }
    }
}

/// Calculate RLP length prefix size
fn rlp_length_prefix_size(len: u64) -> u64 {
    if len < 56 {
        1
    } else {
        1 + ((64 - len.leading_zeros()) as u64 + 7) / 8
    }
}

/// Receipt data from MegaETH RPC
#[derive(Debug, Clone)]
pub struct RawReceipt {
    pub transaction_hash: B256,
    pub gas_used: u64,
    pub status: bool,
    pub contract_address: Option<Address>,
    pub from: Address,
    pub effective_gas_price: Option<u128>,
}

/// Client for interacting with MegaETH RPC using raw JSON-RPC
#[derive(Clone)]
pub struct MegaEthClient {
    client: Client,
    rpc_url: String,
}

impl MegaEthClient {
    pub async fn new(rpc_url: &str) -> Result<Self> {
        Ok(Self {
            client: Client::new(),
            rpc_url: rpc_url.to_string(),
        })
    }

    async fn rpc_call(&self, method: &str, params: Value) -> Result<Value> {
        const MAX_RETRIES: u32 = 3;
        let mut last_error = None;

        for attempt in 0..MAX_RETRIES {
            let result = self.rpc_call_once(method, params.clone()).await;

            match result {
                Ok(value) => return Ok(value),
                Err(e) => {
                    last_error = Some(e);

                    // Only retry on transient errors (network, timeout, 5xx)
                    if attempt < MAX_RETRIES - 1 {
                        let delay = std::time::Duration::from_millis(100 * (1 << attempt)); // Exponential backoff
                        // Only log retries at trace level to reduce spam
                        tokio::time::sleep(delay).await;
                    }
                }
            }
        }

        Err(last_error.unwrap())
    }

    async fn rpc_call_once(&self, method: &str, params: Value) -> Result<Value> {
        let response = self
            .client
            .post(&self.rpc_url)
            .timeout(std::time::Duration::from_secs(10))
            .json(&json!({
                "jsonrpc": "2.0",
                "method": method,
                "params": params,
                "id": 1
            }))
            .send()
            .await
            .context(format!("RPC request failed for method {}", method))?;

        // Check HTTP status
        let status = response.status();
        if !status.is_success() {
            anyhow::bail!("RPC HTTP error {}: {} for method {}", status.as_u16(), status.canonical_reason().unwrap_or(""), method);
        }

        // Try to get the response body as text first for better error messages
        let body_text = response.text().await
            .context(format!("Failed to read response body for method {}", method))?;

        // Try to parse as JSON
        let resp: Value = serde_json::from_str(&body_text)
            .context(format!("Failed to parse JSON response for method {}. Body: {}", method, &body_text[..body_text.len().min(500)]))?;

        if let Some(error) = resp.get("error") {
            anyhow::bail!("RPC error for method {}: {}", method, error);
        }

        Ok(resp["result"].clone())
    }

    pub async fn get_latest_block_number(&self) -> Result<u64> {
        let result = self.rpc_call("eth_blockNumber", json!([])).await?;
        let hex = result.as_str().context("Invalid block number")?;
        Ok(u64::from_str_radix(hex.trim_start_matches("0x"), 16)?)
    }

    pub async fn get_block(&self, block_number: u64) -> Result<Option<RawBlock>> {
        let block_hex = format!("0x{:x}", block_number);
        let result = self.rpc_call("eth_getBlockByNumber", json!([block_hex, true])).await?;

        if result.is_null() {
            return Ok(None);
        }

        let block = result.as_object().context("Block response is not a JSON object")?;

        let number = parse_hex_u64(block.get("number")).context("Failed to parse 'number' field")?;
        let hash = parse_b256(block.get("hash")).context("Failed to parse 'hash' field")?;
        let gas_used = parse_hex_u64(block.get("gasUsed")).context("Failed to parse 'gasUsed' field")?;
        let gas_limit = parse_hex_u64(block.get("gasLimit")).context("Failed to parse 'gasLimit' field")?;
        let timestamp = parse_hex_u64(block.get("timestamp")).context("Failed to parse 'timestamp' field")?;
        
        // Parse extraData (for backwards compatibility)
        let extra_data = block
            .get("extraData")
            .and_then(|v| v.as_str())
            .map(|s| {
                let s = s.strip_prefix("0x").unwrap_or(s);
                Bytes::from(hex::decode(s).unwrap_or_default())
            })
            .unwrap_or_default();

        // Parse miniBlockCount directly from RPC (MegaETH-specific field)
        let mini_block_count = block
            .get("miniBlockCount")
            .and_then(|v| v.as_u64())
            .unwrap_or(1);  // Default to 1 if not present

        let txs = block
            .get("transactions")
            .and_then(|t| t.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|tx| parse_transaction(tx).ok())
                    .collect()
            })
            .unwrap_or_default();

        Ok(Some(RawBlock {
            number,
            hash,
            gas_used,
            gas_limit,
            timestamp,
            extra_data,
            mini_block_count,
            transactions: txs,
        }))
    }

    pub async fn get_block_receipts(&self, block_number: u64) -> Result<Vec<RawReceipt>> {
        let block_hex = format!("0x{:x}", block_number);
        let result = self.rpc_call("eth_getBlockReceipts", json!([block_hex])).await?;

        if result.is_null() {
            return Ok(vec![]);
        }

        let receipts = result
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|r| parse_receipt(r).ok())
                    .collect()
            })
            .unwrap_or_default();

        Ok(receipts)
    }

    pub async fn get_chain_id(&self) -> Result<u64> {
        let result = self.rpc_call("eth_chainId", json!([])).await?;
        let hex = result.as_str().context("Invalid chain ID")?;
        Ok(u64::from_str_radix(hex.trim_start_matches("0x"), 16)?)
    }

    /// Get the latest block number
    pub async fn get_block_number(&self) -> Result<u64> {
        self.get_latest_block_number().await
    }

    /// Get contract code at an address
    pub async fn get_code(&self, address: Address) -> Result<Bytes> {
        let addr_hex = format!("{:?}", address);
        let result = self.rpc_call("eth_getCode", json!([addr_hex, "latest"])).await?;

        let hex = result.as_str().context("Invalid code response")?;
        let hex = hex.trim_start_matches("0x");

        if hex.is_empty() {
            return Ok(Bytes::new());
        }

        let bytes = hex::decode(hex).context("Failed to decode code hex")?;
        Ok(Bytes::from(bytes))
    }

    /// Get account balance
    pub async fn get_balance(&self, address: Address) -> Result<U256> {
        let addr_hex = format!("{:?}", address);
        let result = self.rpc_call("eth_getBalance", json!([addr_hex, "latest"])).await?;

        let hex = result.as_str().context("Invalid balance response")?;
        hex.parse().context("Failed to parse balance")
    }

    /// Get account nonce
    pub async fn get_nonce(&self, address: Address) -> Result<u64> {
        let addr_hex = format!("{:?}", address);
        let result = self.rpc_call("eth_getTransactionCount", json!([addr_hex, "latest"])).await?;

        let hex = result.as_str().context("Invalid nonce response")?;
        u64::from_str_radix(hex.trim_start_matches("0x"), 16)
            .context("Failed to parse nonce")
    }

    /// Get storage value at a specific slot
    pub async fn get_storage_at(&self, address: Address, index: U256) -> Result<U256> {
        let addr_hex = format!("{:?}", address);
        let index_hex = format!("{:#x}", index);
        let result = self.rpc_call("eth_getStorageAt", json!([addr_hex, index_hex, "latest"])).await?;

        let hex = result.as_str().context("Invalid storage response")?;
        hex.parse().context("Failed to parse storage value")
    }

    /// Call a contract function (read-only)
    pub async fn eth_call(&self, to: Address, data: &str) -> Result<Bytes> {
        let to_hex = format!("{:?}", to);
        let result = self.rpc_call("eth_call", json!([{
            "to": to_hex,
            "data": data
        }, "latest"])).await?;

        let hex = result.as_str().context("Invalid eth_call response")?;
        let hex = hex.trim_start_matches("0x");

        if hex.is_empty() {
            return Ok(Bytes::new());
        }

        let bytes = hex::decode(hex).context("Failed to decode eth_call result")?;
        Ok(Bytes::from(bytes))
    }
}

fn parse_hex_u64(val: Option<&Value>) -> Result<u64> {
    let hex = val.and_then(|v| v.as_str())
        .context("Required field is missing or not a string")?;
    u64::from_str_radix(hex.trim_start_matches("0x"), 16)
        .context(format!("Failed to parse hex u64 value: {}", hex))
}

fn parse_hex_u64_opt(val: Option<&Value>) -> u64 {
    val.and_then(|v| v.as_str())
        .and_then(|hex| u64::from_str_radix(hex.trim_start_matches("0x"), 16).ok())
        .unwrap_or(0)
}

fn parse_hex_u128(val: Option<&Value>) -> Option<u128> {
    val.and_then(|v| v.as_str())
        .and_then(|hex| u128::from_str_radix(hex.trim_start_matches("0x"), 16).ok())
}

fn parse_b256(val: Option<&Value>) -> Result<B256> {
    let hex = val
        .and_then(|v| v.as_str())
        .unwrap_or("0x0000000000000000000000000000000000000000000000000000000000000000");
    hex.parse().context("Invalid B256")
}

fn parse_u256(val: Option<&Value>) -> U256 {
    val.and_then(|v| v.as_str())
        .and_then(|hex| hex.parse().ok())
        .unwrap_or(U256::ZERO)
}

fn parse_address(val: Option<&Value>) -> Result<Option<Address>> {
    match val.and_then(|v| v.as_str()) {
        Some(hex) if !hex.is_empty() && hex != "0x" => {
            Ok(Some(hex.parse().context("Invalid address")?))
        }
        _ => Ok(None),
    }
}

fn parse_transaction(tx: &Value) -> Result<RawTransaction> {
    let hash = parse_b256(tx.get("hash")).context("Failed to parse tx 'hash'")?;
    let from = tx
        .get("from")
        .and_then(|v| v.as_str())
        .context("Missing tx 'from' field")?
        .parse()
        .context("Invalid tx 'from' address")?;
    let to = parse_address(tx.get("to")).context("Failed to parse tx 'to' field")?;

    let input_hex = tx.get("input").and_then(|v| v.as_str()).unwrap_or("0x");
    let input_bytes = hex::decode(input_hex.trim_start_matches("0x"))
        .context(format!("Failed to decode tx 'input' hex: {}", input_hex))?;
    let input = Bytes::from(input_bytes);

    let gas = parse_hex_u64(tx.get("gas")).context("Failed to parse tx 'gas'")?;
    let nonce = parse_hex_u64(tx.get("nonce")).context("Failed to parse tx 'nonce'")?;
    let value = parse_u256(tx.get("value"));

    let tx_type = tx
        .get("type")
        .and_then(|v| v.as_str())
        .map(|h| u8::from_str_radix(h.trim_start_matches("0x"), 16).unwrap_or(0))
        .unwrap_or(0);

    let gas_price = parse_hex_u128(tx.get("gasPrice"));
    let max_fee_per_gas = parse_hex_u128(tx.get("maxFeePerGas"));
    let max_priority_fee_per_gas = parse_hex_u128(tx.get("maxPriorityFeePerGas"));

    let chain_id = tx
        .get("chainId")
        .and_then(|v| v.as_str())
        .and_then(|hex| u64::from_str_radix(hex.trim_start_matches("0x"), 16).ok());

    let v = parse_hex_u64(tx.get("v")).context("Failed to parse tx 'v'")?;
    let r = parse_u256(tx.get("r"));
    let s = parse_u256(tx.get("s"));

    // Parse access list if present
    let access_list = tx
        .get("accessList")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let addr: Address = item.get("address")?.as_str()?.parse().ok()?;
                    let keys: Vec<B256> = item
                        .get("storageKeys")?
                        .as_array()?
                        .iter()
                        .filter_map(|k| k.as_str()?.parse().ok())
                        .collect();
                    Some((addr, keys))
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(RawTransaction {
        hash,
        from,
        to,
        input,
        gas,
        tx_type,
        nonce,
        value,
        gas_price,
        max_fee_per_gas,
        max_priority_fee_per_gas,
        chain_id,
        v,
        r,
        s,
        access_list,
    })
}

fn parse_receipt(r: &Value) -> Result<RawReceipt> {
    let transaction_hash = parse_b256(r.get("transactionHash")).context("Failed to parse receipt 'transactionHash'")?;
    let gas_used = parse_hex_u64(r.get("gasUsed")).context("Failed to parse receipt 'gasUsed'")?;
    let status = r
        .get("status")
        .and_then(|v| v.as_str())
        .map(|s| s != "0x0")
        .unwrap_or(true);

    let contract_address = r
        .get("contractAddress")
        .and_then(|v| v.as_str())
        .and_then(|s| if s == "null" || s.is_empty() { None } else { s.parse().ok() });

    let from = r
        .get("from")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse().ok())
        .unwrap_or(Address::ZERO);

    let effective_gas_price = r
        .get("effectiveGasPrice")
        .and_then(|v| v.as_str())
        .and_then(|s| u128::from_str_radix(s.trim_start_matches("0x"), 16).ok());

    Ok(RawReceipt {
        transaction_hash,
        gas_used,
        status,
        contract_address,
        from,
        effective_gas_price,
    })
}
