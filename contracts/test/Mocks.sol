// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {AuctionHouse} from "../src/AuctionHouse.sol";

/// @dev Bidder contract that can be told to reject MON or to re-enter the house on receipt.
contract HostileBidder is IERC721Receiver {
    AuctionHouse public immutable house;
    bool public rejectMon;
    bool public reenterWithdraw;
    bool public reenterEnd;
    uint256 public endId;
    uint256 public reentryAttempts;

    constructor(AuctionHouse h) {
        house = h;
    }

    function setRejectMon(bool v) external {
        rejectMon = v;
    }

    function setReenterWithdraw(bool v) external {
        reenterWithdraw = v;
    }

    function setReenterEnd(bool v, uint256 id) external {
        reenterEnd = v;
        endId = id;
    }

    function bid(uint256 id) external payable {
        house.bid{value: msg.value}(id);
    }

    function withdraw() external {
        house.withdraw();
    }

    receive() external payable {
        if (rejectMon) revert("no MON");
        if (reenterWithdraw) {
            reentryAttempts++;
            house.withdraw(); // must hit ReentrancyGuard and revert the whole withdraw
        }
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        if (reenterEnd) {
            reentryAttempts++;
            house.endAuction(endId); // must revert (nonReentrant)
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}

/// @dev Contract with no ERC-721 receiver hook and no payable receive.
contract PlainContract {
    function bid(AuctionHouse house, uint256 id) external payable {
        house.bid{value: msg.value}(id);
    }
}

/// @dev Seller contract that lists an NFT, then rejects MON proceeds.
contract RejectingSeller is IERC721Receiver {
    function list(AuctionHouse house, ERC721 nft, uint256 tokenId, uint256 minPrice, uint64 duration)
        external
        returns (uint256)
    {
        nft.approve(address(house), tokenId);
        return house.createAuction(address(nft), tokenId, minPrice, duration);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
    // no receive(): MON transfers to this contract fail
}

/// @dev ERC-721 that claims to transfer but never moves the token on the escrow pull.
contract FakeEscrowNFT is ERC721 {
    constructor() ERC721("Fake", "FAKE") {}

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        // silently does nothing
    }
}

/// @dev ERC-721 that re-enters the auction house while being transferred.
contract ReentrantNFT is ERC721 {
    AuctionHouse public house;
    uint256 public targetId;
    bool public armed;
    bool public reentrySucceeded;

    constructor() ERC721("Reentrant", "RE") {}

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }

    function arm(AuctionHouse h, uint256 id) external {
        house = h;
        targetId = id;
        armed = true;
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (armed) {
            armed = false;
            // Try to settle again from inside the settlement transfer.
            try house.endAuction(targetId) {
                reentrySucceeded = true;
            } catch {}
        }
        return super._update(to, tokenId, auth);
    }
}

/// @dev Force-sends MON to a target via SELFDESTRUCT (cannot be blocked by the receiver).
contract ForceSender {
    constructor(address payable target) payable {
        selfdestruct(target);
    }
}
