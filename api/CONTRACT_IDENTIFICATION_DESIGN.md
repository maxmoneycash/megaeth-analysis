# Automated Contract Identification System Design

## The Problem
Given a contract address like `0x3c2269811836af69497e5f486a85d7316753cf62`, how do we automatically determine:
- Project name (e.g., "Uniswap V3")
- Category (DEX, Oracle, Bridge)
- Logo/Symbol
- Description

## How GrowthPie (and Others) Do It

### Method 1: Block Explorer Verification ⭐ (Most Reliable)
When contracts are deployed, developers can "verify" them on block explorers by uploading source code.

**What you get:**
- Contract name: "UniswapV3Pool"
- Constructor args: often include protocol names
- Source code comments: "// Uniswap V3 Router"
- License: links to protocol repos

**How to automate:**
```
1. Query block explorer API: GET /api?module=contract&action=getsourcecode&address=0x...
2. Parse response JSON for:
   - ContractName
   - CompilerVersion
   - SourceCode (contains imports like "@uniswap/v3-core")
3. Extract protocol name from imports and comments
```

### Method 2: Contract Name/Symbol Functions 🏷️
Many contracts (especially ERC-20 tokens) implement `name()` and `symbol()` functions.

**How to automate:**
```
1. Call eth_call with:
   - to: contract_address
   - data: 0x06fdde03 (function selector for name())
2. Decode response to get name
3. Call 0x95d89b41 for symbol()
```

### Method 3: Bytecode Fingerprinting 🔍 (Very Powerful)
Protocols deploy the same contract code across multiple chains.

**Strategy:**
```
1. Build database of known contract bytecodes:
   {
     "bytecode_hash": "0xabc123...",
     "project": "Uniswap V3",
     "type": "Factory"
   }
2. For unknown contract:
   - Get bytecode via eth_getCode
   - Hash it (or compare directly)
   - Lookup in database
3. Match = instant identification
```

**Sources for known bytecodes:**
- Ethereum mainnet verified contracts
- Official protocol GitHub repos (compiled contracts)
- Other L2s (Base, Arbitrum, Optimism)

### Method 4: Event Signature Analysis 📊
Every protocol has unique event signatures.

**Examples:**
- Uniswap V3: `Swap(address,address,int256,int256,uint160,uint128,int24)`
- Chainlink: `AnswerUpdated(int256,uint256,uint256)`
- Aave: `Deposit(address,address,uint256,uint16)`

**How to automate:**
```
1. Fetch recent transactions for contract
2. Extract event topics (first topic = event signature hash)
3. Match against known protocol event signatures
4. High match rate = identified protocol
```

### Method 5: Deployer Address Analysis 👤
Protocols use consistent deployer addresses.

**How to automate:**
```
1. Get contract creation transaction
2. Extract deployer address
3. Check against database of known deployers:
   - Uniswap deployer: 0x...
   - Chainlink deployer: 0x...
   - etc.
```

### Method 6: Cross-Chain Bytecode Database 🌐 (Most Scalable)
This is probably what GrowthPie uses!

**The insight:**
- Uniswap V3 Factory on Ethereum = same bytecode on MegaETH
- Can build a bytecode→project database from all EVM chains
- Query once, identify anywhere

**Implementation:**
```
Database schema:
- bytecode_hash
- project_name
- contract_type (Factory, Router, Pool, etc.)
- chains_deployed (array of chain IDs)
- official_addresses (array of known addresses)

Lookup process:
1. Get bytecode from MegaETH contract
2. Hash it
3. Query database
4. Return project info
```

### Method 7: LLM-Based Source Code Analysis 🤖
If contract is verified, use AI to analyze source code.

**What LLM can extract:**
- Import statements: `import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol"`
- Comments: `/// @title Uniswap V3 Factory`
- License headers: `// SPDX-License-Identifier: GPL-2.0-or-later`
- Repository links in comments

### Method 8: Transaction Pattern Heuristics 📈
Different contract types have distinct patterns.

**Oracle contracts:**
- Frequent small updates (every block)
- Single updater address
- High gas usage

**DEX contracts:**
- Many different users
- Swap/Add/Remove liquidity patterns
- Token approvals

**Bridge contracts:**
- Lock/unlock patterns
- Cross-chain message events

## Proposed Automated System Architecture

```
┌─────────────────────────────────────────┐
│   Contract Address Input                │
│   0x3c2269811836af69497e5f486a85d7...   │
└───────────────┬─────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────┐
│   Step 1: Quick Cache Lookup              │
│   - Check if already identified           │
│   - Check contracts.json                  │
└───────────────┬───────────────────────────┘
                │ Not found
                ▼
┌───────────────────────────────────────────┐
│   Step 2: Block Explorer Query            │
│   - Get verified source code              │
│   - Extract contract name                 │
│   - Parse imports and comments            │
└───────────────┬───────────────────────────┘
                │ If verified
                ▼
┌───────────────────────────────────────────┐
│   Step 3: LLM Analysis (if verified)      │
│   - Analyze source code                   │
│   - Extract project name from imports     │
│   - Identify protocol from patterns       │
└───────────────┬───────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────┐
│   Step 4: Bytecode Fingerprinting         │
│   - Get contract bytecode                 │
│   - Hash bytecode                         │
│   - Query cross-chain database            │
│   - Match against known contracts         │
└───────────────┬───────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────┐
│   Step 5: RPC Function Calls              │
│   - Try name() function                   │
│   - Try symbol() function                 │
│   - Extract token/protocol name           │
└───────────────┬───────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────┐
│   Step 6: Event Signature Analysis        │
│   - Fetch recent transactions             │
│   - Extract event signatures              │
│   - Match against protocol patterns       │
└───────────────┬───────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────┐
│   Step 7: Deployer Analysis               │
│   - Get creation transaction              │
│   - Check deployer against known list     │
└───────────────┬───────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────┐
│   Result: Project Identified              │
│   {                                       │
│     "name": "Uniswap V3",                │
│     "category": "dex",                    │
│     "confidence": 0.95                    │
│   }                                       │
└───────────────────────────────────────────┘
```

## Implementation Priority

### Phase 1: Quick Wins (Implement First) ⚡
1. **Block Explorer API** - Most reliable, gets 80% of contracts
2. **RPC name()/symbol() calls** - Gets token contracts
3. **Manual additions** - For important contracts

### Phase 2: Advanced (Implement Second) 🚀
4. **Bytecode fingerprinting** - Build cross-chain database
5. **Event signature analysis** - Pattern matching

### Phase 3: AI-Powered (Implement Third) 🤖
6. **LLM source code analysis** - For edge cases
7. **Transaction pattern heuristics** - Machine learning

## Data Sources

### For Building Cross-Chain Bytecode Database:
- Ethereum mainnet verified contracts (Etherscan API)
- Base verified contracts (Basescan API)
- Optimism verified contracts (Optimistic Etherscan API)
- Arbitrum verified contracts (Arbiscan API)
- Official protocol GitHub repos

### For Known Deployer Addresses:
- DefiLlama's adapter repos
- GrowthPie's data (if accessible)
- Blockchain ETL datasets
- Dune Analytics queries

### For Event Signatures:
- 4byte.directory (function/event signature database)
- Samczsun's signature database
- Contract ABIs from verified sources

## Cost-Benefit Analysis

| Method | Accuracy | Speed | Cost | Implementation |
|--------|----------|-------|------|----------------|
| Block Explorer | 95% | Medium | Free* | Easy |
| Name/Symbol RPC | 80% | Fast | Free | Very Easy |
| Bytecode DB | 90% | Very Fast | Storage | Medium |
| Event Analysis | 70% | Slow | RPC calls | Medium |
| LLM Analysis | 85% | Slow | API cost | Easy |
| Deployer Check | 60% | Fast | Free | Easy |

*Free tiers available, rate limits apply

## Recommended Approach for MegaViz

```rust
async fn identify_contract(address: Address) -> ContractInfo {
    // 1. Check cache first (contracts.json)
    if let Some(info) = check_cache(address) {
        return info;
    }

    // 2. Try block explorer (if MegaETH has API)
    if let Ok(info) = query_block_explorer(address).await {
        if info.is_verified {
            return extract_from_source_code(info);
        }
    }

    // 3. Try name/symbol functions
    if let Ok(name) = call_name_function(address).await {
        return infer_from_name(name);
    }

    // 4. Try bytecode fingerprinting
    let bytecode = get_bytecode(address).await?;
    if let Some(match) = lookup_bytecode_db(bytecode).await {
        return match;
    }

    // 5. Fallback: generate generic name
    return ContractInfo {
        name: format!("Contract {}", &address[2..8].to_uppercase()),
        category: "other",
        confidence: 0.1,
    };
}
```
