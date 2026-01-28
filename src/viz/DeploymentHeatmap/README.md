# Contract Deployment Heatmap

Interactive heatmap visualization showing contract deployment activity on MegaETH over time.

## Features

- **Three View Modes:**
  - **Daily**: 14 days × 24 hours - hourly deployment activity for the last 2 weeks
  - **Weekly**: 12 weeks × 7 weekdays - daily deployment patterns over 12 weeks
  - **Monthly**: 12 months × 31 days - monthly deployment trends over a year

- **Color Coding:**
  - Uses percentile-based color scale (P10-P90) for relative comparison
  - Blue (cool) → Green → Yellow → Orange/Red (warm)
  - Empty cells (0 deployments) show faint grid outline only

- **Interactive Tooltips:**
  - Time context (date, hour/day/weekday)
  - Deployment counts (total contracts, unique deployers)
  - Size metrics (average contract size, P95 contract size)
  - Gas metrics (total gas, average gas per contract)
  - Contract type breakdown (NFT, Token, DEX, Other)
  - List of deployed contract addresses (for cells with ≤10 contracts)

## Tech Stack

- **PixiJS** - High-performance 2D graphics rendering
- **Vanilla JavaScript** - No framework dependencies
- **MegaViz API** - Backend data aggregation

## Data Source

Pulls data from:
- `/api/deployments/heatmap?view={daily|weekly|monthly}` - Grid data
- `/api/deployments/details?start={timestamp}&end={timestamp}` - Cell details on hover

## Usage

1. Make sure the MegaViz API is running with QuestDB enabled:
   ```bash
   cd /Users/leena/Documents/GitHub/MegaViz/api
   QUESTDB_ENABLED=true ./target/release/megaviz-api
   ```

2. Open the visualization:
   ```bash
   open /Users/leena/Documents/GitHub/MegaViz/src/viz/DeploymentHeatmap/contract-deployment-heatmap.html
   ```

3. Switch between views using the buttons at the top

## Color Scale Algorithm

1. Collect all non-zero deployment counts
2. Calculate P10 (10th percentile) and P90 (90th percentile)
3. Normalize each cell's value:
   - If value ≤ P10: map to 0.0 (coolest blue)
   - If value ≥ P90: map to 1.0 (warmest red/orange)
   - Otherwise: linear interpolation between P10 and P90
4. Map normalized value to color gradient using 6 color stops

## Performance

- Efficient rendering with PixiJS Graphics API
- Caches cell detail requests to avoid redundant API calls
- Smooth hover interactions with hardware-accelerated canvas

## Requirements

- Modern browser with ES6+ support
- MegaViz API running on `localhost:3001`
- QuestDB with contract_deployments table populated
