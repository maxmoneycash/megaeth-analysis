#!/usr/bin/env python3
"""
Helper script to convert GrowthPie contract data to contracts.json format

Usage:
1. Get GrowthPie data (inspect their network requests in browser DevTools)
2. Save the JSON response to a file: growthpie_data.json
3. Run: python3 convert_growthpie_to_contracts.py growthpie_data.json
"""

import json
import sys
from datetime import datetime

def category_mapping(gp_category):
    """Map GrowthPie categories to our categories"""
    mapping = {
        'oracle': 'oracle',
        'oracles': 'oracle',
        'cross_chain': 'bridge',
        'bridge': 'bridge',
        'bridges': 'bridge',
        'dex': 'dex',
        'exchange': 'dex',
        'lending': 'lending',
        'defi': 'defi',
        'nft': 'nft',
        'gaming': 'gaming',
        'social': 'social',
        'infrastructure': 'infrastructure',
    }
    return mapping.get(gp_category.lower(), 'other')

def logo_for_category(category):
    """Get emoji logo for category"""
    logos = {
        'oracle': '🔮',
        'bridge': '🌉',
        'dex': '💱',
        'lending': '🏦',
        'defi': '💰',
        'nft': '🖼️',
        'gaming': '🎮',
        'social': '👥',
        'infrastructure': '⚙️',
        'other': '📦',
    }
    return logos.get(category, '📦')

def convert_growthpie_to_contracts(gp_data):
    """Convert GrowthPie format to our contracts.json format"""
    contracts = {}

    # Handle different possible GrowthPie response formats
    if isinstance(gp_data, dict):
        apps = gp_data.get('applications', gp_data.get('apps', gp_data.get('data', [])))
    else:
        apps = gp_data

    for app in apps:
        # Extract address (try different field names)
        address = (
            app.get('contract_address') or
            app.get('address') or
            app.get('contract')
        )

        if not address:
            continue

        # Normalize address to lowercase
        address = address.lower()

        # Extract name
        name = app.get('name', app.get('protocol_name', 'Unknown'))

        # Extract category
        gp_category = app.get('category', app.get('type', 'other'))
        category = category_mapping(gp_category)

        # Generate symbol (first 3-4 letters uppercase)
        symbol = name.replace(' ', '')[:4].upper()

        # Description
        description = app.get('description', f"{name} on MegaETH")

        contracts[address] = {
            "name": name,
            "symbol": symbol,
            "category": category,
            "logo": logo_for_category(category),
            "description": description
        }

    result = {
        "contracts": contracts,
        "metadata": {
            "version": "1.0.0",
            "lastUpdated": datetime.now().strftime("%Y-%m-%d"),
            "source": "Imported from GrowthPie data"
        }
    }

    return result

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 convert_growthpie_to_contracts.py <growthpie_data.json>")
        print("\nYou can get GrowthPie data by:")
        print("1. Opening https://www.growthepie.com/chains/megaeth?tab=apps")
        print("2. Opening DevTools (F12) → Network tab")
        print("3. Finding the API request for applications/contracts data")
        print("4. Right-click → Copy Response → Save to file")
        sys.exit(1)

    input_file = sys.argv[1]

    try:
        with open(input_file, 'r') as f:
            gp_data = json.load(f)

        converted = convert_growthpie_to_contracts(gp_data)

        output_file = 'contracts_from_growthpie.json'
        with open(output_file, 'w') as f:
            json.dump(converted, f, indent=2)

        print(f"✅ Converted {len(converted['contracts'])} contracts")
        print(f"📝 Output saved to: {output_file}")
        print(f"\nPreview:")
        print(json.dumps(list(converted['contracts'].items())[:3], indent=2))
        print("\nNext steps:")
        print("1. Review the generated file")
        print("2. Merge with your existing contracts.json")
        print("3. Restart the API server")

    except FileNotFoundError:
        print(f"❌ Error: File '{input_file}' not found")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Error: Invalid JSON in '{input_file}': {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
