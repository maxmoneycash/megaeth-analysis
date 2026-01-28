#!/usr/bin/env python3
"""
Complete Contract Detection System for MegaETH

This script orchestrates the entire contract identification system:
1. Builds bytecode database (cross-chain contracts)
2. Starts real-time deployment monitor (MegaETH-native contracts)
3. Merges results into contracts.json
4. Restarts API server with new contract names

Usage:
    python3 run_contract_detection.py --mode full
    python3 run_contract_detection.py --mode monitor-only
    python3 run_contract_detection.py --mode sync-only
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List

class ContractDetectionSystem:
    def __init__(self, api_dir: str):
        self.api_dir = Path(api_dir)
        self.scripts_dir = self.api_dir / "scripts"
        self.contracts_json = self.api_dir / "contracts.json"
        self.identified_json = self.api_dir / "identified_contracts.json"
        self.bytecode_db = self.api_dir / "bytecode_database.json"

    def run_command(self, cmd: List[str], description: str, cwd: str = None):
        """Run a shell command and print output"""
        print(f"\n{'='*60}")
        print(f"📝 {description}")
        print(f"{'='*60}")
        print(f"$ {' '.join(cmd)}")

        try:
            result = subprocess.run(
                cmd,
                cwd=cwd or str(self.api_dir),
                capture_output=False,
                text=True,
                check=True
            )
            print(f"✅ {description} - SUCCESS")
            return True
        except subprocess.CalledProcessError as e:
            print(f"❌ {description} - FAILED")
            print(f"Error: {e}")
            return False
        except FileNotFoundError:
            print(f"❌ Command not found: {cmd[0]}")
            return False

    def build_bytecode_database(self) -> bool:
        """Step 1: Build bytecode database from Ethereum/Base/Optimism"""
        print("\n" + "="*60)
        print("STEP 1: Building Bytecode Database")
        print("="*60)
        print("This will query Ethereum, Base, and Optimism for known contracts")
        print("Time: ~5-10 minutes (depending on API keys)")

        # Check if database already exists
        if self.bytecode_db.exists():
            age_hours = (time.time() - self.bytecode_db.stat().st_mtime) / 3600
            if age_hours < 24:
                print(f"\n✅ Bytecode database already exists (age: {age_hours:.1f}h)")
                response = input("Do you want to rebuild it? (y/N): ")
                if response.lower() != 'y':
                    return True

        return self.run_command(
            ["python3", "build_bytecode_database.py",
             "--output", str(self.bytecode_db)],
            "Building bytecode database",
            cwd=str(self.scripts_dir)
        )

    def start_monitor(self, background: bool = True) -> subprocess.Popen:
        """Step 2: Start real-time deployment monitor"""
        print("\n" + "="*60)
        print("STEP 2: Starting Real-Time Monitor")
        print("="*60)
        print("Monitoring MegaETH for new contract deployments...")

        # Build the binary first
        print("Building contract_monitor binary...")
        build_result = self.run_command(
            ["cargo", "build", "--release", "--bin", "contract_monitor"],
            "Building contract_monitor"
        )

        if not build_result:
            print("❌ Failed to build contract_monitor")
            return None

        # Start the monitor
        env = os.environ.copy()
        env["RPC_URL"] = env.get("RPC_URL", "https://mainnet.megaeth.com/rpc")
        env["OUTPUT_FILE"] = str(self.identified_json)
        env["RUST_LOG"] = "info"

        binary = self.api_dir / "target" / "release" / "contract_monitor"

        if background:
            print(f"\n🚀 Starting monitor in background...")
            print(f"   Output: {self.identified_json}")
            print(f"   Logs: monitor.log")

            log_file = open(self.api_dir / "monitor.log", "w")
            process = subprocess.Popen(
                [str(binary)],
                cwd=str(self.api_dir),
                env=env,
                stdout=log_file,
                stderr=subprocess.STDOUT
            )

            # Wait a bit to see if it starts successfully
            time.sleep(3)
            if process.poll() is None:
                print(f"✅ Monitor started (PID: {process.pid})")
                print(f"   Follow logs: tail -f {self.api_dir}/monitor.log")
                return process
            else:
                print(f"❌ Monitor failed to start")
                return None
        else:
            # Run in foreground
            print(f"\n🚀 Starting monitor in foreground...")
            print("   Press Ctrl+C to stop")
            process = subprocess.Popen(
                [str(binary)],
                cwd=str(self.api_dir),
                env=env
            )
            return process

    def merge_results(self) -> bool:
        """Step 3: Merge identified contracts into contracts.json"""
        print("\n" + "="*60)
        print("STEP 3: Merging Results into contracts.json")
        print("="*60)

        if not self.identified_json.exists():
            print(f"⚠️  No identified contracts yet: {self.identified_json}")
            return True

        # Load identified contracts
        with open(self.identified_json, 'r') as f:
            identified = json.load(f)

        print(f"📊 Found {len(identified)} identified contracts")

        # Filter by confidence
        high_confidence = {
            addr: info for addr, info in identified.items()
            if info.get('confidence', 0) >= 0.7
        }

        print(f"✅ {len(high_confidence)} contracts with high confidence (>=70%)")

        if not high_confidence:
            print("   Nothing to merge.")
            return True

        # Load existing contracts.json
        if self.contracts_json.exists():
            with open(self.contracts_json, 'r') as f:
                contracts_data = json.load(f)
        else:
            contracts_data = {
                "contracts": {},
                "metadata": {
                    "version": "1.0.0",
                    "lastUpdated": time.strftime("%Y-%m-%d"),
                    "source": "Automated detection"
                }
            }

        # Merge new contracts
        added = 0
        for addr, info in high_confidence.items():
            addr_lower = addr.lower()

            if addr_lower not in contracts_data["contracts"]:
                contracts_data["contracts"][addr_lower] = {
                    "name": info["name"],
                    "symbol": info["symbol"],
                    "category": info["category"],
                    "logo": self.get_emoji_for_category(info["category"]),
                    "description": f"{info['name']} ({info['detection_method']})"
                }
                added += 1
                print(f"  ➕ Added: {info['name']} ({info['category']})")

        if added > 0:
            # Update metadata
            contracts_data["metadata"]["lastUpdated"] = time.strftime("%Y-%m-%d")

            # Save
            with open(self.contracts_json, 'w') as f:
                json.dump(contracts_data, f, indent=2)

            print(f"\n✅ Added {added} new contracts to contracts.json")
            return True
        else:
            print("\n✅ No new contracts to add (all already in database)")
            return True

    def get_emoji_for_category(self, category: str) -> str:
        """Get emoji for contract category"""
        emojis = {
            "oracle": "🔮",
            "bridge": "🌉",
            "dex": "💱",
            "token": "💰",
            "nft": "🖼️",
            "lending": "🏦",
            "defi": "💎",
            "gaming": "🎮",
            "infrastructure": "⚙️",
            "unknown": "📦",
            "other": "📦",
        }
        return emojis.get(category, "📦")

    def restart_api(self) -> bool:
        """Step 4: Restart API server to load new contracts"""
        print("\n" + "="*60)
        print("STEP 4: Restarting API Server")
        print("="*60)

        # Kill existing API server
        print("Stopping existing API server...")
        subprocess.run(["pkill", "-f", "megaviz-api"], capture_output=True)
        time.sleep(2)

        # Start API server
        env = os.environ.copy()
        env["QUESTDB_ENABLED"] = "true"
        env["RPC_URL"] = env.get("RPC_URL", "https://mainnet.megaeth.com/rpc")
        env["QUESTDB_HOST"] = "localhost"
        env["QUESTDB_ILP_PORT"] = "9009"
        env["QUESTDB_PG_PORT"] = "8812"

        binary = self.api_dir / "target" / "release" / "megaviz-api"

        if not binary.exists():
            print("Building megaviz-api...")
            if not self.run_command(
                ["cargo", "build", "--release", "--bin", "megaviz-api"],
                "Building megaviz-api"
            ):
                return False

        print("\n🚀 Starting API server...")
        log_file = open(self.api_dir / "api_server.log", "w")
        process = subprocess.Popen(
            [str(binary)],
            cwd=str(self.api_dir),
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT
        )

        # Wait for startup
        print("⏳ Waiting for API to start...")
        time.sleep(10)

        if process.poll() is None:
            print(f"✅ API server started (PID: {process.pid})")
            print(f"   API: http://localhost:3001")
            print(f"   Logs: {self.api_dir}/api_server.log")
            return True
        else:
            print("❌ API server failed to start")
            return False

    def show_stats(self):
        """Show statistics about identified contracts"""
        print("\n" + "="*60)
        print("📊 STATISTICS")
        print("="*60)

        # Bytecode database stats
        if self.bytecode_db.exists():
            with open(self.bytecode_db, 'r') as f:
                bytecode_data = json.load(f)
                print(f"\nBytecode Database:")
                print(f"  Contracts: {bytecode_data['metadata']['total_contracts']}")
                print(f"  Addresses: {bytecode_data['metadata']['total_addresses']}")

        # Identified contracts stats
        if self.identified_json.exists():
            with open(self.identified_json, 'r') as f:
                identified = json.load(f)
                print(f"\nIdentified Contracts (Real-Time):")
                print(f"  Total: {len(identified)}")

                # Count by confidence
                high = sum(1 for c in identified.values() if c.get('confidence', 0) >= 0.7)
                medium = sum(1 for c in identified.values() if 0.4 <= c.get('confidence', 0) < 0.7)
                low = sum(1 for c in identified.values() if c.get('confidence', 0) < 0.4)

                print(f"  High confidence (>=70%): {high}")
                print(f"  Medium confidence (40-70%): {medium}")
                print(f"  Low confidence (<40%): {low}")

                # Count by category
                categories = {}
                for c in identified.values():
                    cat = c.get('category', 'unknown')
                    categories[cat] = categories.get(cat, 0) + 1

                print(f"\n  By category:")
                for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
                    print(f"    {cat}: {count}")

        # contracts.json stats
        if self.contracts_json.exists():
            with open(self.contracts_json, 'r') as f:
                contracts_data = json.load(f)
                print(f"\ncontracts.json (Active Database):")
                print(f"  Total: {len(contracts_data['contracts'])}")

                # Count by category
                categories = {}
                for c in contracts_data['contracts'].values():
                    cat = c.get('category', 'other')
                    categories[cat] = categories.get(cat, 0) + 1

                print(f"  By category:")
                for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
                    print(f"    {cat}: {count}")


def main():
    parser = argparse.ArgumentParser(
        description="Complete Contract Detection System for MegaETH"
    )
    parser.add_argument(
        "--mode",
        choices=["full", "monitor-only", "sync-only", "stats"],
        default="full",
        help="Operation mode"
    )
    parser.add_argument(
        "--api-dir",
        default="/Users/leena/Documents/GitHub/MegaViz/api",
        help="Path to API directory"
    )
    parser.add_argument(
        "--foreground",
        action="store_true",
        help="Run monitor in foreground (don't daemonize)"
    )

    args = parser.parse_args()

    system = ContractDetectionSystem(args.api_dir)

    print("╔══════════════════════════════════════════════════════════════╗")
    print("║                                                              ║")
    print("║      MegaETH Contract Detection System                      ║")
    print("║                                                              ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    if args.mode == "stats":
        system.show_stats()
        return

    if args.mode == "full":
        # Full pipeline
        print("\n🚀 Running FULL pipeline:")
        print("  1. Build bytecode database")
        print("  2. Start real-time monitor")
        print("  3. Merge results")
        print("  4. Restart API")

        # Step 1: Build bytecode DB
        if not system.build_bytecode_database():
            print("\n❌ Failed to build bytecode database")
            sys.exit(1)

        # Step 2: Start monitor
        monitor_process = system.start_monitor(background=not args.foreground)

        if monitor_process is None:
            print("\n❌ Failed to start monitor")
            sys.exit(1)

        if args.foreground:
            # Run in foreground
            try:
                monitor_process.wait()
            except KeyboardInterrupt:
                print("\n🛑 Stopping monitor...")
                monitor_process.terminate()
                monitor_process.wait()
        else:
            # Wait a bit for monitor to collect some data
            print("\n⏳ Waiting 30 seconds for monitor to collect data...")
            time.sleep(30)

            # Step 3: Merge results
            system.merge_results()

            # Step 4: Restart API
            system.restart_api()

            # Show stats
            system.show_stats()

            print("\n" + "="*60)
            print("✅ SYSTEM RUNNING")
            print("="*60)
            print(f"Monitor PID: {monitor_process.pid}")
            print(f"Monitor logs: {system.api_dir}/monitor.log")
            print(f"API logs: {system.api_dir}/api_server.log")
            print(f"Dashboard: http://localhost:3001")
            print("\nTo sync contracts periodically:")
            print("  python3 run_contract_detection.py --mode sync-only")

    elif args.mode == "monitor-only":
        # Just start the monitor
        monitor_process = system.start_monitor(background=not args.foreground)

        if monitor_process and not args.foreground:
            print(f"\n✅ Monitor running (PID: {monitor_process.pid})")
            print("   To stop: kill", monitor_process.pid)
        elif monitor_process:
            try:
                monitor_process.wait()
            except KeyboardInterrupt:
                print("\n🛑 Stopping...")
                monitor_process.terminate()

    elif args.mode == "sync-only":
        # Just merge results and restart API
        print("\n🔄 Syncing contracts...")
        system.merge_results()
        system.restart_api()
        system.show_stats()


if __name__ == "__main__":
    main()
