// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DemoNFT} from "../src/DemoNFT.sol";

contract DemoNFTTest is Test {
    DemoNFT nft;
    address alice = makeAddr("alice");

    function setUp() public {
        nft = new DemoNFT();
    }

    function test_Metadata() public view {
        assertEq(nft.name(), "Demo NFT");
        assertEq(nft.symbol(), "DNFT");
    }

    function test_MintAssignsIncrementingIds() public {
        vm.prank(makeAddr("anyone")); // unrestricted mint (demo only)
        assertEq(nft.mint(alice), 1);
        assertEq(nft.mint(alice), 2);
        assertEq(nft.mint(address(this)), 3);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.ownerOf(3), address(this));
        assertEq(nft.balanceOf(alice), 2);
        assertEq(nft.nextTokenId(), 4);
    }

    function test_MintRejectsZeroRecipient() public {
        vm.expectRevert(DemoNFT.InvalidRecipient.selector);
        nft.mint(address(0));
        assertEq(nft.nextTokenId(), 1);
    }

    function test_MintWithURIStoresMetadata() public {
        string memory uri = "data:application/json;base64,eyJuYW1lIjoiS2FtZXJhIn0=";
        uint256 id = nft.mintWithURI(alice, uri);
        assertEq(id, 1);
        assertEq(nft.ownerOf(id), alice);
        assertEq(nft.tokenURI(id), uri);
        assertEq(nft.tokenURI(nft.mint(alice)), "", "plain mint has no URI");
    }

    function test_MintWithURIRejectsBadInput() public {
        vm.expectRevert(DemoNFT.InvalidURI.selector);
        nft.mintWithURI(alice, "");
        bytes memory long = new bytes(2049);
        vm.expectRevert(DemoNFT.InvalidURI.selector);
        nft.mintWithURI(alice, string(long));
        vm.expectRevert(DemoNFT.InvalidRecipient.selector);
        nft.mintWithURI(address(0), "ipfs://x");
        assertEq(nft.nextTokenId(), 1);
    }

    function test_SupportsERC721Interface() public view {
        assertTrue(nft.supportsInterface(0x80ac58cd));
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
