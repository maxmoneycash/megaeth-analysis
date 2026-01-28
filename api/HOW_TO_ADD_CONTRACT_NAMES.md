# How to Add Contract Names (Chainlink, RedStone, Layer Zero, etc.)

This guide shows you how to add real application names to your MegaViz dashboard, just like GrowthPie does.

## Quick Start (3 Steps)

### Step 1: Get Contract Addresses from GrowthPie

**Method A: Browser DevTools (Easiest)**

1. Open https://www.growthepie.com/chains/megaeth?origin_key=megaeth&tab=apps
2. Press **F12** to open DevTools
3. Go to **Network** tab
4. **Reload the page** (Cmd+R or Ctrl+R)
5. Look for requests to their API (usually named like `applications`, `contracts`, or `chains`)
6. Click on the request → **Preview** or **Response** tab
7. You'll see JSON data with contract addresses and names!
8. Right-click → **Copy Response** → Save to a file

**Method B: Using Our Helper Script**

```bash
cd /Users/leena/Documents/GitHub/MegaViz/api/scripts

# If you saved GrowthPie's JSON response to a file:
python3 convert_growthpie_to_contracts.py ~/Downloads/growthpie_data.json

# This generates: contracts_from_growthpie.json
```

### Step 2: Add Contracts to contracts.json

Open `/Users/leena/Documents/GitHub/MegaViz/api/contracts.json` and add entries:

```json
{
  "contracts": {
    "0x[address_in_lowercase]": {
      "name": "Chainlink",
      "symbol": "LINK",
      "category": "oracle",
      "logo": "🔗",
      "description": "Decentralized oracle network"
    },
    "0x[another_address]": {
      "name": "RedStone",
      "symbol": "RED",
      "category": "oracle",
      "logo": "🔴",
      "description": "Real-time price oracle"
    }
  }
}
```

**Important:**
- Addresses must be **lowercase**
- Addresses must start with **0x**
- Use categories: `oracle`, `bridge`, `dex`, `lending`, `defi`, `nft`, `gaming`, `social`, `infrastructure`, `other`

### Step 3: Restart API Server

```bash
cd /Users/leena/Documents/GitHub/MegaViz/api

# Stop current server
pkill -f megaviz-api

# Start with new contract names
QUESTDB_ENABLED=true \
RPC_URL=https://mainnet.megaeth.com/rpc \
QUESTDB_HOST=localhost \
QUESTDB_ILP_PORT=9009 \
QUESTDB_PG_PORT=8812 \
./target/release/megaviz-api > /tmp/api_server_v2.log 2>&1 &

# Wait for it to start (takes ~30 seconds)
sleep 30

# Test it
curl -s "http://localhost:3001/api/app-leaderboard?period=all" | jq '.[0:5] | .[] | {name, category}'
```

## Contract Categories & Logos

| Category | Logo | Examples |
|----------|------|----------|
| `oracle` | 🔮 | Chainlink, RedStone, Pyth |
| `bridge` | 🌉 | LayerZero, Warp, Synapse |
| `dex` | 💱 | Uniswap, SushiSwap, Curve |
| `lending` | 🏦 | Aave, Compound |
| `defi` | 💰 | Yearn, Convex |
| `nft` | 🖼️ | OpenSea, Blur |
| `gaming` | 🎮 | Games |
| `social` | 👥 | Social apps |
| `infrastructure` | ⚙️ | System contracts |
| `other` | 📦 | Uncategorized |

## Example Entries

### Oracle Protocols

```json
"0x[chainlink_verifier_proxy]": {
  "name": "Chainlink Data Streams",
  "symbol": "LINK",
  "category": "oracle",
  "logo": "🔗",
  "description": "Real-time oracle feeds"
},
"0x[redstone_bolt]": {
  "name": "RedStone Bolt",
  "symbol": "RED",
  "category": "oracle",
  "logo": "🔴",
  "description": "2.4ms push oracle"
},
"0x[pyth_oracle]": {
  "name": "Pyth Network",
  "symbol": "PYTH",
  "category": "oracle",
  "logo": "⚡",
  "description": "High-frequency price oracle"
}
```

### Bridge Protocols

```json
"0x[layerzero_endpoint]": {
  "name": "LayerZero",
  "symbol": "LZ",
  "category": "bridge",
  "logo": "🌉",
  "description": "Omnichain messaging"
},
"0x[warp_router]": {
  "name": "Warp",
  "symbol": "WARP",
  "category": "bridge",
  "logo": "🚀",
  "description": "Cross-chain bridge"
}
```

### DEX Protocols

```json
"0x[uniswap_factory]": {
  "name": "Uniswap V3",
  "symbol": "UNI",
  "category": "dex",
  "logo": "🦄",
  "description": "Decentralized exchange"
},
"0x[sushiswap_router]": {
  "name": "SushiSwap",
  "symbol": "SUSHI",
  "category": "dex",
  "logo": "🍣",
  "description": "Community-run DEX"
}
```

## Finding Contract Addresses

### 1. From Protocol Documentation

- **Chainlink:** https://docs.chain.link/data-streams/supported-networks
- **RedStone:** https://app.redstone.finance (check MegaETH deployments)
- **LayerZero:** https://docs.layerzero.network/v2/deployments/deployed-contracts
- **Pyth:** https://pyth.network/developers/price-feed-ids

### 2. From Block Explorers

- MegaETH Explorer (if available)
- Search by transaction volume
- Verified contracts show their name

### 3. From GrowthPie

- They already curated the list
- Use DevTools method above to extract their data

### 4. From Your Own Data

Check which contracts have the most activity:

```bash
curl -s "http://localhost:9000/exec?query=SELECT+contract_address%2C+count()+as+tx_count+FROM+contract_activity+GROUP+BY+contract_address+ORDER+BY+tx_count+DESC+LIMIT+20" | jq -r '.dataset[] | "\(.[1]) txs - \(.[0])"'
```

Then look up those addresses to identify them.

## Troubleshooting

**Q: I added contracts but don't see the names**
- Make sure you restarted the API server
- Check addresses are lowercase
- Check JSON syntax is valid: `jq . contracts.json`

**Q: How do I know if it worked?**
```bash
# Test the API
curl -s "http://localhost:3001/api/app-leaderboard?period=all" | jq '.[0:5]'

# You should see your new contract names
```

**Q: Can I use the same names as GrowthPie?**
- Yes! That's the whole point. Just copy their addresses and names.

**Q: What if the contract isn't on GrowthPie?**
- Check the block explorer
- Look at the contract's verified source code name
- Check the project's official docs for deployment addresses

## Resources

- [Chainlink on MegaETH](https://chainlinktoday.com/megaeth-natively-integrates-chainlink-data-streams-to-power-real-time-defi/)
- [RedStone Bolt Launch](https://blog.redstone.finance/2025/04/08/introducing-redstone-bolt-the-fastest-blockchain-oracle-to-date/)
- [LayerZero Docs](https://docs.layerzero.network/v2/deployments/deployed-contracts)
- [GrowthPie MegaETH](https://www.growthepie.com/chains/megaeth?origin_key=megaeth&tab=apps)

## Sources

- [Chainlink taps MegaETH for first native, real-time oracle](https://www.theblock.co/post/374749/chainlink-taps-megaeth-for-first-native-real-time-oracle-to-power-next-gen-defi)
- [RedStone rolls out new 'Bolt' oracle on MegaETH](https://www.theblock.co/post/349908/redstone-rolls-out-new-bolt-oracle-on-monolithic-ethereum-scaling-solution-megaeth)
- [LayerZero Deployed Endpoints](https://docs.layerzero.network/v2/deployments/deployed-contracts)
