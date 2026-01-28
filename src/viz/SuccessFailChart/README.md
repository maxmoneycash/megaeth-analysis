# Successful vs. Failed Transactions Chart

Stacked area chart visualization showing the distribution of successful (green) and failed (red) transactions on MegaETH over time, inspired by Solana's transaction rate visualization.

## Features

- **Four View Modes:**
  - **Daily**: Last 30 days of transaction success/failure distribution
  - **Weekly**: Last 12 weeks aggregated by week
  - **Monthly**: Last 12 months of monthly transaction trends
  - **All**: Complete history from Frontier launch (Dec 18, 2025)

- **Stacked Area Chart:**
  - Green area (bottom): Successful transactions percentage
  - Red area (top): Failed transactions percentage
  - Stacked to 100% for clear proportional view
  - Smooth area fills with no gaps

- **Interactive Tooltip:**
  - Hover over any point to see exact date and percentages
  - Vertical hover line indicator
  - Smooth tooltip positioning

## Visual Design

Matches the Solana blockchain explorer aesthetic:
- **Green (#44aa44)**: Successful transactions (90% opacity)
- **Red (#ff4444)**: Failed transactions (90% opacity)
- **White background**: Clean, professional look
- **Grid lines**: Horizontal percentage markers (0%, 25%, 50%, 75%, 100%)

## Tech Stack

- **PixiJS 8** - WebGL-accelerated 2D graphics rendering
- **Vanilla JavaScript** - No framework dependencies
- **MegaViz API** - Backend data aggregation (when available)

## Data Source

**Future API endpoint:**
- `/api/tx-success-rate?view={daily|weekly|monthly|all}` - Transaction success/failure rates

**Data format:**
```json
[
  {
    "timestamp": "2025-12-18T00:00:00Z",
    "label": "2025-12-18",
    "success_percent": 95.5,
    "fail_percent": 4.5
  }
]
```

## Usage

1. Open the visualization:
   ```bash
   open /Users/leena/Documents/GitHub/MegaViz/src/viz/SuccessFailChart/success-fail-chart.html
   ```

2. Switch between views using the buttons at the top

3. Hover over the chart to see detailed percentages for any time point

## Mock Data

Currently generates realistic mock data:
- Success rate: 90-98% (typical for healthy blockchain)
- Failure rate: 2-10%
- Random variation to simulate real-world patterns
- Data starts from Frontier launch date (Dec 18, 2025)

## Data Collection Plan

To display real data, the system needs to:

1. **Add transaction status tracking to QuestDB:**
   - New columns: `failed_tx_count`, `successful_tx_count` in `block_production` table
   - Or new table: `transaction_stats` with per-block breakdowns

2. **Backfill historical data:**
   - Fetch receipts for all blocks since Frontier (~2.5M blocks)
   - Count successful (status=1) vs failed (status=0) transactions per block
   - Aggregate by time period for each view mode

3. **Live data ingestion:**
   - Track success/failure for each new block as it arrives
   - Update QuestDB in real-time

4. **API endpoint:**
   - Aggregate data by view mode (daily/weekly/monthly/all)
   - Return percentage distribution for frontend

## Performance

- 60 FPS rendering with PixiJS WebGL
- Efficient stacked area drawing with single path per area
- Smooth hover detection with distance-based point finding
- Responsive resize with debouncing

## Requirements

- Modern browser with ES6+ support
- MegaViz API with transaction status tracking (future)
- QuestDB with transaction success/failure data (future)

## Notes

- Data starts from Frontier launch: **December 18, 2025**
- All percentages sum to 100% (stacked to full height)
- Hover line helps identify exact time points
- View modes automatically adjust x-axis label density
