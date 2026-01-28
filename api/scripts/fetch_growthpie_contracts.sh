#!/bin/bash

# Fetch contract data from GrowthPie's API
# This will show you the addresses and names they use

echo "Fetching MegaETH application data from GrowthPie..."

# Try to fetch the data (you'll need to inspect their network calls to get the exact endpoint)
curl -s "https://api.growthepie.xyz/v1/chains/megaeth/applications" \
  -H "Accept: application/json" \
  | jq '.' > /tmp/growthpie_contracts.json

echo "Data saved to /tmp/growthpie_contracts.json"
echo ""
echo "Sample contracts:"
jq '.[] | {name: .name, address: .contract_address, category: .category}' /tmp/growthpie_contracts.json | head -20
