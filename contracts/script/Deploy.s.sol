// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AuctionHouse} from "../src/AuctionHouse.sol";
import {DemoNFT} from "../src/DemoNFT.sol";

/// @notice Local deployment (anvil): DemoNFT, then AuctionHouse, then 3 demo NFTs to the deployer.
///         Monad Testnet uses the monskills Agent Wallet + CreateX flow (script/deploy-testnet.sh).
contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();

        DemoNFT nft = new DemoNFT();
        AuctionHouse house = new AuctionHouse();
        for (uint256 i; i < 3; i++) {
            nft.mint(deployer);
        }
        vm.stopBroadcast();

        console.log("=== Aqad deployment ===");
        console.log("chainId      ", block.chainid);
        console.log("deployer     ", deployer);
        console.log("DemoNFT      ", address(nft));
        console.log("AuctionHouse ", address(house));
        console.log("Demo NFTs minted to deployer: 1, 2, 3");
    }
}
