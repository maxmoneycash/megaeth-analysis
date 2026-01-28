# Contract Entry Template for contracts.json

## Categories
- `oracle` - Oracle services (Chainlink, RedStone, Pyth)
- `bridge` - Cross-chain bridges (LayerZero, Warp, Synapse)
- `dex` - Decentralized exchanges (Uniswap, SushiSwap, Curve)
- `lending` - Lending protocols (Aave, Compound)
- `defi` - General DeFi (Yearn, Convex)
- `infrastructure` - System contracts (L1 Block, Sequencer)
- `nft` - NFT marketplaces (OpenSea, Blur)
- `gaming` - Gaming applications
- `social` - Social applications
- `other` - Uncategorized

## Template Entry

```json
"0x[CONTRACT_ADDRESS_LOWERCASE]": {
  "name": "Protocol Name",
  "symbol": "SYMBOL",
  "category": "oracle",
  "logo": "🔗",
  "description": "Short description"
}
```

## Real Examples

### Oracle Protocols
```json
"0x[address]": {
  "name": "Chainlink",
  "symbol": "LINK",
  "category": "oracle",
  "logo": "🔗",
  "description": "Decentralized oracle network"
}

"0x[address]": {
  "name": "RedStone",
  "symbol": "RED",
  "category": "oracle",
  "logo": "🔴",
  "description": "Push oracle with 2.4ms updates"
}

"0x[address]": {
  "name": "Pyth Network",
  "symbol": "PYTH",
  "category": "oracle",
  "logo": "⚡",
  "description": "High-frequency price feeds"
}
```

### Bridge Protocols
```json
"0x[address]": {
  "name": "LayerZero",
  "symbol": "LZ",
  "category": "bridge",
  "logo": "🌉",
  "description": "Omnichain interoperability"
}

"0x[address]": {
  "name": "Warp",
  "symbol": "WARP",
  "category": "bridge",
  "logo": "🚀",
  "description": "Cross-chain bridge"
}
```

### DEX Protocols
```json
"0x[address]": {
  "name": "Uniswap V3",
  "symbol": "UNI",
  "category": "dex",
  "logo": "🦄",
  "description": "Automated market maker"
}
```

## Steps to Add

1. Find the contract address (from GrowthPie, explorer, or docs)
2. Make sure address is lowercase with 0x prefix
3. Add entry to contracts.json following the template
4. Restart API server to load new names:
   ```bash
   pkill -f megaviz-api
   QUESTDB_ENABLED=true RPC_URL=https://mainnet.megaeth.com/rpc \
   QUESTDB_HOST=localhost QUESTDB_ILP_PORT=9009 QUESTDB_PG_PORT=8812 \
   ./target/release/megaviz-api > /tmp/api_server_v2.log 2>&1 &
   ```
