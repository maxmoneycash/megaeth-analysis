#!/usr/bin/env python3
"""
Demo: Automated Contract Identification

This script demonstrates how to automatically identify contracts on MegaETH
using multiple detection methods.

Usage:
    python3 demo_contract_identification.py 0x3c2269811836af69497e5f486a85d7316753cf62
"""

import sys
import json
import requests
import hashlib
from web3 import Web3
from typing import Optional, Dict

class ContractIdentifier:
    """Automated contract identification system"""

    def __init__(self, rpc_url: str = "https://mainnet.megaeth.com/rpc"):
        self.rpc_url = rpc_url
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.session = requests.Session()

    def identify(self, address: str) -> Dict:
        """Main identification pipeline"""
        address = Web3.to_checksum_address(address)

        print(f"🔍 Identifying contract: {address}")
        print("=" * 60)

        result = {
            "address": address,
            "methods_tried": [],
            "identified": False,
            "name": None,
            "category": None,
            "confidence": 0.0
        }

        # Method 1: Try RPC name/symbol functions
        print("\n[Method 1] Trying RPC name/symbol functions...")
        if info := self.try_rpc_name_symbol(address):
            result.update(info)
            result["methods_tried"].append("rpc_name_symbol")
            result["identified"] = True
            print(f"  ✅ Success! Name: {info['name']}, Category: {info['category']}")
            return result
        else:
            print("  ❌ No response from name/symbol functions")

        # Method 2: Try bytecode fingerprinting
        print("\n[Method 2] Trying bytecode fingerprinting...")
        if info := self.try_bytecode_fingerprint(address):
            result.update(info)
            result["methods_tried"].append("bytecode_fingerprint")
            result["identified"] = True
            print(f"  ✅ Success! Name: {info['name']}, Category: {info['category']}")
            return result
        else:
            print("  ❌ No bytecode match found")

        # Method 3: Try contract source analysis (if verified)
        print("\n[Method 3] Trying contract verification check...")
        if info := self.try_verification_check(address):
            result.update(info)
            result["methods_tried"].append("verification_check")
            result["identified"] = True
            print(f"  ✅ Success! Name: {info['name']}, Category: {info['category']}")
            return result
        else:
            print("  ❌ Contract not verified or explorer unavailable")

        # Method 4: Analyze transaction patterns
        print("\n[Method 4] Analyzing transaction patterns...")
        if info := self.analyze_transaction_patterns(address):
            result.update(info)
            result["methods_tried"].append("transaction_patterns")
            print(f"  ⚠️  Partial identification: {info}")
        else:
            print("  ❌ Could not determine pattern")

        # Fallback: Generate generic name
        if not result["identified"]:
            print("\n[Fallback] Generating generic name...")
            result.update(self.generate_fallback_name(address))
            result["methods_tried"].append("fallback")

        return result

    def try_rpc_name_symbol(self, address: str) -> Optional[Dict]:
        """Method 1: Query name() and symbol() functions"""
        try:
            # Try calling name() - function selector: 0x06fdde03
            name_data = self.w3.eth.call({
                'to': address,
                'data': '0x06fdde03'
            })

            # Decode the result
            if len(name_data) > 64:
                # ABI decode string
                length = int.from_bytes(name_data[32:64], 'big')
                name = name_data[64:64+length].decode('utf-8', errors='ignore').strip()

                if name and len(name) > 0:
                    # Try to get symbol too
                    try:
                        symbol_data = self.w3.eth.call({
                            'to': address,
                            'data': '0x95d89b41'
                        })
                        symbol_length = int.from_bytes(symbol_data[32:64], 'big')
                        symbol = symbol_data[64:64+symbol_length].decode('utf-8', errors='ignore').strip()
                    except:
                        symbol = name[:4].upper()

                    # Infer category from name
                    category = self.infer_category_from_name(name)

                    return {
                        "name": name,
                        "symbol": symbol,
                        "category": category,
                        "confidence": 0.85,
                        "source": "RPC name/symbol"
                    }

        except Exception as e:
            pass

        return None

    def try_bytecode_fingerprint(self, address: str) -> Optional[Dict]:
        """Method 2: Bytecode fingerprinting"""
        try:
            # Get contract bytecode
            bytecode = self.w3.eth.get_code(address)

            if len(bytecode) < 10:
                return None

            # Hash the bytecode
            bytecode_hash = hashlib.sha256(bytecode).hexdigest()

            # Load bytecode database if exists
            try:
                with open('bytecode_database.json', 'r') as f:
                    db = json.load(f)

                if bytecode_hash in db.get('contracts', {}):
                    contract_info = db['contracts'][bytecode_hash]
                    return {
                        "name": contract_info['name'],
                        "symbol": contract_info['symbol'],
                        "category": contract_info['category'],
                        "confidence": 0.98,
                        "source": "Bytecode fingerprint"
                    }

            except FileNotFoundError:
                print("    ℹ️  No bytecode database found (run build_bytecode_database.py first)")

        except Exception as e:
            print(f"    Error: {e}")

        return None

    def try_verification_check(self, address: str) -> Optional[Dict]:
        """Method 3: Check if contract is verified on block explorer"""
        # This would query the MegaETH block explorer API
        # Placeholder for now since we don't have the exact API endpoint

        # Example of what this would look like:
        # url = f"https://explorer.megaeth.com/api?module=contract&action=getsourcecode&address={address}"
        # response = self.session.get(url)
        # ...

        return None

    def analyze_transaction_patterns(self, address: str) -> Optional[Dict]:
        """Method 4: Analyze transaction patterns for hints"""
        try:
            # Get recent transaction count
            tx_count = self.w3.eth.get_transaction_count(address)

            # Get contract balance
            balance = self.w3.eth.get_balance(address)

            patterns = {}

            # High transaction count might indicate popular contract
            if tx_count > 1000:
                patterns["high_activity"] = True

            # Check balance
            if balance > 0:
                patterns["holds_eth"] = True

            return patterns if patterns else None

        except Exception as e:
            return None

    def infer_category_from_name(self, name: str) -> str:
        """Infer category from contract/token name"""
        name_lower = name.lower()

        keywords = {
            "oracle": ["oracle", "feed", "price", "chainlink", "redstone", "pyth"],
            "bridge": ["bridge", "portal", "layer", "cross", "warp"],
            "dex": ["swap", "pool", "dex", "amm", "uniswap", "sushi", "curve"],
            "lending": ["lend", "borrow", "aave", "compound", "liquidity"],
            "defi": ["vault", "strategy", "yield", "farm", "stake"],
            "nft": ["nft", "721", "1155", "collectible", "token"]
        }

        for category, words in keywords.items():
            if any(word in name_lower for word in words):
                return category

        return "other"

    def generate_fallback_name(self, address: str) -> Dict:
        """Generate generic name from address"""
        return {
            "name": f"Contract {address[2:8].upper()}",
            "symbol": address[2:6].upper(),
            "category": "other",
            "confidence": 0.1,
            "source": "Fallback (address-based)"
        }


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 demo_contract_identification.py <contract_address>")
        print("\nExample contracts to try:")
        print("  0x6342000000000000000000000000000000000001  (MegaETH Oracle)")
        print("  0x897a33a0af45b3ba097bd6045187d622252e6acd  (MegaETH Testnet Contract)")
        sys.exit(1)

    address = sys.argv[1]

    # Initialize identifier
    identifier = ContractIdentifier()

    # Run identification
    result = identifier.identify(address)

    # Print results
    print("\n" + "=" * 60)
    print("📊 IDENTIFICATION RESULTS")
    print("=" * 60)
    print(f"Address:    {result['address']}")
    print(f"Identified: {'✅ Yes' if result['identified'] else '❌ No'}")
    print(f"Name:       {result.get('name', 'Unknown')}")
    print(f"Symbol:     {result.get('symbol', 'N/A')}")
    print(f"Category:   {result.get('category', 'unknown')}")
    print(f"Confidence: {result.get('confidence', 0):.0%}")
    print(f"Source:     {result.get('source', 'N/A')}")
    print(f"Methods:    {', '.join(result['methods_tried'])}")

    # Generate contracts.json entry
    if result['identified']:
        print("\n" + "=" * 60)
        print("📝 ADD TO contracts.json:")
        print("=" * 60)
        entry = {
            address.lower(): {
                "name": result['name'],
                "symbol": result['symbol'],
                "category": result['category'],
                "logo": get_emoji_for_category(result['category']),
                "description": f"{result['name']} contract"
            }
        }
        print(json.dumps(entry, indent=2))


def get_emoji_for_category(category: str) -> str:
    """Get emoji for category"""
    emojis = {
        "oracle": "🔮",
        "bridge": "🌉",
        "dex": "💱",
        "lending": "🏦",
        "defi": "💰",
        "nft": "🖼️",
        "gaming": "🎮",
        "social": "👥",
        "infrastructure": "⚙️",
        "other": "📦"
    }
    return emojis.get(category, "📦")


if __name__ == '__main__':
    main()
