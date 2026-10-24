// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AuctionHouse} from "../src/AuctionHouse.sol";
import {DemoNFT} from "../src/DemoNFT.sol";

/// @dev Drives random create/bid/withdraw/end/cancel/warp sequences with 4 actors and
///      at most 5 auctions, tracking liabilities in ghost variables.
contract Handler is Test {
    AuctionHouse public house;
    DemoNFT public nft;
    address[4] public actors;
    uint256 public constant MAX_AUCTIONS = 5;

    uint256 public ghostDeposited; // all MON bid into the house
    uint256 public ghostWithdrawn; // refunds withdrawn by bidders
    uint256 public ghostPaidToSellers; // settlement proceeds
    uint256 public ghostForced; // MON force-sent (unsolicited)

    constructor(AuctionHouse h, DemoNFT n) {
        house = h;
        nft = n;
        for (uint256 i; i < 4; i++) {
            actors[i] = makeAddr(string.concat("actor", vm.toString(i)));
            vm.deal(actors[i], 10_000 ether);
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % 4];
    }

    function _id(uint256 seed) internal view returns (uint256) {
        uint256 n = house.nextAuctionId() - 1;
        return n == 0 ? 0 : (seed % n) + 1;
    }

    function create(uint256 actorSeed, uint256 minPrice, uint64 duration) external {
        if (house.nextAuctionId() > MAX_AUCTIONS) return;
        address seller = _actor(actorSeed);
        minPrice = bound(minPrice, 1, 10 ether);
        duration = uint64(bound(duration, 1, 10 minutes));
        uint256 tokenId = nft.mint(seller);
        vm.startPrank(seller);
        nft.approve(address(house), tokenId);
        house.createAuction(address(nft), tokenId, minPrice, duration);
        vm.stopPrank();
    }

    function bid(uint256 actorSeed, uint256 idSeed, uint256 extra) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        address bidder = _actor(actorSeed);
        (address seller,,,,, address top, uint64 end, AuctionHouse.Status status) = house.auctions(id);
        if (status != AuctionHouse.Status.Active || block.timestamp >= end || bidder == seller || bidder == top) {
            return;
        }
        uint256 amount = house.minNextBid(id) + bound(extra, 0, 1 ether);
        vm.prank(bidder);
        house.bid{value: amount}(id);
        ghostDeposited += amount;
    }

    function withdraw(uint256 actorSeed) external {
        address a = _actor(actorSeed);
        uint256 owed = house.pendingReturns(a);
        if (owed == 0) return;
        vm.prank(a);
        house.withdraw();
        ghostWithdrawn += owed;
    }

    function end(uint256 idSeed) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        (,,,, uint256 top,, uint64 endTime, AuctionHouse.Status status) = house.auctions(id);
        if (status != AuctionHouse.Status.Active || block.timestamp < endTime) return;
        house.endAuction(id);
        ghostPaidToSellers += top;
    }

    function cancel(uint256 idSeed) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        (address seller,,,,, address top,, AuctionHouse.Status status) = house.auctions(id);
        if (status != AuctionHouse.Status.Active || top != address(0)) return;
        vm.prank(seller);
        house.cancelAuction(id);
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 3 minutes));
    }

    function force(uint256 amount) external {
        amount = bound(amount, 1, 1 ether);
        vm.deal(address(this), amount);
        new Forcer{value: amount}(payable(address(house)));
        ghostForced += amount;
    }

    function actorAt(uint256 i) external view returns (address) {
        return actors[i];
    }
}

contract Forcer {
    constructor(address payable t) payable {
        selfdestruct(t);
    }
}

contract AuctionHouseInvariantTest is Test {
    AuctionHouse house;
    DemoNFT nft;
    Handler handler;

    function setUp() public {
        house = new AuctionHouse();
        nft = new DemoNFT();
        handler = new Handler(house, nft);
        targetContract(address(handler));
    }

    function _liabilities() internal view returns (uint256 activeBids, uint256 pending) {
        uint256 n = house.nextAuctionId();
        for (uint256 id = 1; id < n; id++) { // bounded: at most 5 auctions
            (,,,, uint256 top,,, AuctionHouse.Status status) = house.auctions(id);
            if (status == AuctionHouse.Status.Active) activeBids += top;
        }
        for (uint256 i; i < 4; i++) {
            pending += house.pendingReturns(handler.actorAt(i));
        }
    }

    /// balance >= active bids + pending refunds (forced MON can only add to the left side).
    function invariant_SolventForAllLiabilities() public view {
        (uint256 activeBids, uint256 pending) = _liabilities();
        assertGe(address(house).balance, activeBids + pending);
    }

    /// Exact: balance == liabilities + unsolicited forced MON.
    function invariant_ExactAccounting() public view {
        (uint256 activeBids, uint256 pending) = _liabilities();
        assertEq(address(house).balance, activeBids + pending + handler.ghostForced());
    }

    /// Every wei deposited is either still owed, withdrawn, or paid to a seller.
    function invariant_MonConservation() public view {
        (uint256 activeBids, uint256 pending) = _liabilities();
        assertEq(
            handler.ghostDeposited(),
            activeBids + pending + handler.ghostWithdrawn() + handler.ghostPaidToSellers()
        );
    }

    /// Escrowed NFTs belong to Active auctions only.
    function invariant_NftCustody() public view {
        uint256 n = house.nextAuctionId();
        for (uint256 id = 1; id < n; id++) {
            (address seller,, uint256 tokenId,,, address top,, AuctionHouse.Status status) = house.auctions(id);
            address owner = nft.ownerOf(tokenId);
            if (status == AuctionHouse.Status.Active) assertEq(owner, address(house));
            else if (status == AuctionHouse.Status.Cancelled) assertEq(owner, seller);
            else assertEq(owner, top == address(0) ? seller : top);
        }
    }
}
