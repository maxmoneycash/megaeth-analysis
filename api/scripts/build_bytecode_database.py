#!/usr/bin/env python3
"""
Bytecode Database Builder

This script builds a database of contract bytecodes from multiple EVM chains
to enable automatic contract identification via bytecode fingerprinting.

The key insight: protocols deploy identical contract bytecode across chains.
If we know 0xABC on Ethereum is Uniswap V3 Factory, and 0xXYZ on MegaETH
has the same bytecode, then 0xXYZ is also Uniswap V3 Factory!

Usage:
    python3 build_bytecode_database.py --chains ethereum,base,optimism
"""

import json
import hashlib
import requests
import time
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
from collections import defaultdict

@dataclass
class ContractRecord:
    """Record of a known contract"""
    name: str
    symbol: str
    category: str
    bytecode_hash: str
    addresses: Dict[str, str]  # chain_id -> address
    source: str  # How we identified it

class BytecodeDatabase:
    def __init__(self):
        self.contracts = {}  # bytecode_hash -> ContractRecord
        self.address_index = {}  # (chain_id, address) -> bytecode_hash

    def add_contract(self, chain_id: str, address: str, bytecode: str,
                    name: str, category: str = "other", symbol: str = ""):
        """Add a contract to the database"""
        # Hash the bytecode
        bytecode_hash = hashlib.sha256(bytes.fromhex(bytecode[2:])).hexdigest()

        # Check if we've seen this bytecode before
        if bytecode_hash in self.contracts:
            # Add this address to existing record
            self.contracts[bytecode_hash].addresses[chain_id] = address
        else:
            # Create new record
            self.contracts[bytecode_hash] = ContractRecord(
                name=name,
                symbol=symbol or name[:4].upper(),
                category=category,
                bytecode_hash=bytecode_hash,
                addresses={chain_id: address},
                source="Multi-chain verification"
            )

        # Index by address
        self.address_index[(chain_id, address.lower())] = bytecode_hash

    def lookup_by_bytecode(self, bytecode: str) -> Optional[ContractRecord]:
        """Look up a contract by its bytecode"""
        bytecode_hash = hashlib.sha256(bytes.fromhex(bytecode[2:])).hexdigest()
        return self.contracts.get(bytecode_hash)

    def lookup_by_address(self, chain_id: str, address: str) -> Optional[ContractRecord]:
        """Look up a contract by chain + address"""
        bytecode_hash = self.address_index.get((chain_id, address.lower()))
        if bytecode_hash:
            return self.contracts[bytecode_hash]
        return None

    def save(self, filename: str):
        """Save database to JSON file"""
        data = {
            "contracts": {
                h: asdict(record)
                for h, record in self.contracts.items()
            },
            "metadata": {
                "total_contracts": len(self.contracts),
                "total_addresses": len(self.address_index),
                "chains": list(set(chain for chain, _ in self.address_index.keys()))
            }
        }

        with open(filename, 'w') as f:
            json.dump(data, f, indent=2)

        print(f"✅ Saved {len(self.contracts)} unique contracts to {filename}")

    def load(self, filename: str):
        """Load database from JSON file"""
        with open(filename, 'r') as f:
            data = json.load(f)

        for hash, record_dict in data['contracts'].items():
            record = ContractRecord(**record_dict)
            self.contracts[hash] = record

            # Rebuild address index
            for chain_id, address in record.addresses.items():
                self.address_index[(chain_id, address.lower())] = hash

        print(f"✅ Loaded {len(self.contracts)} contracts from {filename}")


class BlockExplorerScraper:
    """Scrape verified contracts from block explorers"""

    EXPLORERS = {
        "1": {  # Ethereum mainnet
            "name": "Ethereum",
            "api": "https://api.etherscan.io/api",
            "api_key_env": "ETHERSCAN_API_KEY"
        },
        "8453": {  # Base
            "name": "Base",
            "api": "https://api.basescan.org/api",
            "api_key_env": "BASESCAN_API_KEY"
        },
        "10": {  # Optimism
            "name": "Optimism",
            "api": "https://api-optimistic.etherscan.io/api",
            "api_key_env": "OPTIMISM_API_KEY"
        },
        "42161": {  # Arbitrum
            "name": "Arbitrum",
            "api": "https://api.arbiscan.io/api",
            "api_key_env": "ARBISCAN_API_KEY"
        }
    }

    def __init__(self, api_keys: Dict[str, str]):
        self.api_keys = api_keys
        self.session = requests.Session()

    def get_verified_contracts(self, chain_id: str, project_name: str) -> List[Dict]:
        """Get verified contracts for a specific project"""
        explorer = self.EXPLORERS.get(chain_id)
        if not explorer:
            print(f"❌ No explorer configured for chain {chain_id}")
            return []

        api_key = self.api_keys.get(chain_id)
        if not api_key:
            print(f"⚠️  No API key for {explorer['name']}")
            return []

        print(f"🔍 Searching {explorer['name']} for {project_name}...")

        # Search for contracts by name
        # Note: This is a simplified approach. In production, you'd:
        # 1. Have a curated list of known contract addresses per chain
        # 2. Use protocol-specific APIs (e.g., Uniswap subgraph)
        # 3. Parse deployment events from protocol deployer addresses

        return []

    def get_contract_details(self, chain_id: str, address: str) -> Optional[Dict]:
        """Get contract details from block explorer"""
        explorer = self.EXPLORERS.get(chain_id)
        if not explorer:
            return None

        api_key = self.api_keys.get(chain_id)
        if not api_key:
            return None

        url = f"{explorer['api']}"
        params = {
            "module": "contract",
            "action": "getsourcecode",
            "address": address,
            "apikey": api_key
        }

        try:
            response = self.session.get(url, params=params, timeout=10)
            data = response.json()

            if data['status'] == '1' and data['result']:
                result = data['result'][0]
                return {
                    "name": result.get('ContractName', ''),
                    "source": result.get('SourceCode', ''),
                    "bytecode": result.get('Bytecode', ''),
                    "is_verified": bool(result.get('ContractName'))
                }

            return None

        except Exception as e:
            print(f"❌ Error fetching {address} from {explorer['name']}: {e}")
            return None

        finally:
            time.sleep(0.2)  # Rate limiting


# Curated list of important protocol contracts
KNOWN_PROTOCOLS = {
    "Uniswap V3": {
        "addresses": {
            "1": "0x1F98431c8aD98523631AE4a59f267346ea31F984",  # Factory
            "10": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
            "42161": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
            "8453": "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
        },
        "category": "dex",
        "type": "Factory"
    },
    "Uniswap V2": {
        "addresses": {
            "1": "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
            "8453": "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
        },
        "category": "dex",
        "type": "Factory"
    },
    "Chainlink": {
        "addresses": {
            "1": "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",  # ETH/USD
            "10": "0x13e3Ee699D1909E989722E753853AE30b17e08c5",
        },
        "category": "oracle",
        "type": "Price Feed"
    },
    "Aave V3": {
        "addresses": {
            "1": "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
            "10": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
            "42161": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
        },
        "category": "lending",
        "type": "Pool"
    }
}


def build_database_from_known_protocols(api_keys: Dict[str, str]) -> BytecodeDatabase:
    """Build database from curated list of known protocols"""
    db = BytecodeDatabase()
    scraper = BlockExplorerScraper(api_keys)

    for protocol_name, protocol_data in KNOWN_PROTOCOLS.items():
        print(f"\n📦 Processing {protocol_name}...")

        for chain_id, address in protocol_data['addresses'].items():
            print(f"  🔗 Chain {chain_id}: {address}")

            # Get contract details
            details = scraper.get_contract_details(chain_id, address)

            if details and details['bytecode']:
                db.add_contract(
                    chain_id=chain_id,
                    address=address,
                    bytecode=details['bytecode'],
                    name=f"{protocol_name} {protocol_data.get('type', '')}".strip(),
                    category=protocol_data['category'],
                    symbol=protocol_name.replace(' ', '')[:4].upper()
                )
                print(f"    ✅ Added to database")
            else:
                print(f"    ❌ Could not fetch bytecode")

            time.sleep(0.5)  # Rate limiting

    return db


def main():
    import os
    import argparse

    parser = argparse.ArgumentParser(description='Build contract bytecode database')
    parser.add_argument('--output', default='bytecode_database.json',
                       help='Output file path')
    parser.add_argument('--api-keys', type=str,
                       help='JSON file with API keys')
    args = parser.parse_args()

    # Load API keys
    api_keys = {}
    if args.api_keys and os.path.exists(args.api_keys):
        with open(args.api_keys) as f:
            api_keys = json.load(f)
    else:
        # Try environment variables
        api_keys = {
            "1": os.getenv("ETHERSCAN_API_KEY", ""),
            "8453": os.getenv("BASESCAN_API_KEY", ""),
            "10": os.getenv("OPTIMISM_API_KEY", ""),
            "42161": os.getenv("ARBISCAN_API_KEY", ""),
        }

    print("🚀 Building bytecode database...")
    print(f"📝 Using API keys for: {[k for k, v in api_keys.items() if v]}")

    # Build database
    db = build_database_from_known_protocols(api_keys)

    # Save to file
    db.save(args.output)

    # Print statistics
    print(f"\n📊 Database Statistics:")
    print(f"   Total unique contracts: {len(db.contracts)}")
    print(f"   Total addresses: {len(db.address_index)}")

    chains = defaultdict(int)
    for (chain_id, _) in db.address_index.keys():
        chains[chain_id] += 1

    print(f"   Addresses per chain:")
    for chain_id, count in sorted(chains.items()):
        chain_name = BlockExplorerScraper.EXPLORERS.get(chain_id, {}).get('name', chain_id)
        print(f"     {chain_name}: {count}")


if __name__ == '__main__':
    main()
