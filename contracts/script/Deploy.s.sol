// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AqadLelang} from "../src/AqadLelang.sol";
import {LotNFT} from "../src/LotNFT.sol";

/// Deploys the auction and the lot NFT. The NFT is owned by HOST_ADDRESS (Fahim's
/// MetaMask) so the host console can mint lots.
contract Deploy is Script {
    function run() external {
        address host = vm.envAddress("HOST_ADDRESS");
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        AqadLelang auction = new AqadLelang();
        LotNFT nft = new LotNFT(host);
        vm.stopBroadcast();
        console.log("AqadLelang:", address(auction));
        console.log("LotNFT:", address(nft));
    }
}
