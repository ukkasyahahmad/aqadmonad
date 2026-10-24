// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AqadLelang} from "../src/AqadLelang.sol";
import {LotNFT} from "../src/LotNFT.sol";

/// A bidder contract that refuses MON until told otherwise. Used to prove a bad
/// bidder can't block the auction: its refund goes to `owed` instead.
contract Rejecter {
    AqadLelang public immutable auction;
    bool public accept;

    constructor(AqadLelang a) {
        auction = a;
    }

    function bid(uint256 id) external payable {
        auction.bid{value: msg.value}(id);
    }

    function withdraw() external {
        auction.withdraw();
    }

    function setAccept(bool a) external {
        accept = a;
    }

    receive() external payable {
        require(accept, "no thanks");
    }
}

contract AqadLelangTest is Test {
    AqadLelang auction;
    LotNFT nft;
    address seller = makeAddr("seller");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    uint256 id;

    event BidPlaced(
        uint256 indexed id, address indexed bidder, uint256 amount, uint64 endsAt, address indexed prevBidder, uint256 refunded
    );
    event Extended(uint256 indexed id, uint64 endsAt);
    event Settled(uint256 indexed id, address indexed winner, uint256 amount);

    function setUp() public {
        auction = new AqadLelang();
        nft = new LotNFT(seller);
        vm.startPrank(seller);
        nft.safeMint(seller, "https://example.com/lot/1.json");
        nft.approve(address(auction), 1);
        id = auction.create(address(nft), 1, 0.05 ether, 0.01 ether, 60, 10);
        vm.stopPrank();
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function _endsAt() internal view returns (uint64 endsAt) {
        (,,,,, endsAt,,,,) = auction.auctions(id);
    }

    function _top() internal view returns (address bidder, uint128 amount) {
        (,,,,,,, bidder, amount,) = auction.auctions(id);
    }

    function test_CreateHoldsNftAndStartsAtIdOne() public view {
        assertEq(id, 1);
        assertEq(auction.lastId(), 1);
        assertEq(nft.ownerOf(1), address(auction));
        assertEq(_endsAt(), block.timestamp + 60);
    }

    // 1
    function test_Reserve() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AqadLelang.BidTooLow.selector, 0.05 ether));
        auction.bid{value: 0.04 ether}(id);

        vm.prank(alice);
        auction.bid{value: 0.05 ether}(id);
        (address top, uint128 amount) = _top();
        assertEq(top, alice);
        assertEq(amount, 0.05 ether);
    }

    // 2
    function test_OutbidRefundsSameTx() public {
        vm.prank(alice);
        auction.bid{value: 0.05 ether}(id);

        vm.expectEmit(true, true, true, true);
        emit BidPlaced(id, bob, 0.06 ether, _endsAt(), alice, 0.05 ether);
        vm.prank(bob);
        auction.bid{value: 0.06 ether}(id);

        assertEq(alice.balance, 10 ether);
        assertEq(address(auction).balance, 0.06 ether);
    }

    // 3
    function test_MinStep() public {
        vm.prank(alice);
        auction.bid{value: 0.05 ether}(id);
        assertEq(auction.minNextBid(id), 0.06 ether);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(AqadLelang.BidTooLow.selector, 0.06 ether));
        auction.bid{value: 0.055 ether}(id);
    }

    // 4
    function test_AntiSnipeExtends() public {
        uint64 original = _endsAt();
        vm.warp(original - 30);
        vm.prank(alice);
        auction.bid{value: 0.05 ether}(id);
        assertEq(_endsAt(), original, "outside buffer: unchanged");

        vm.warp(original - 5);
        vm.expectEmit(true, true, true, true);
        emit Extended(id, uint64(block.timestamp + 10));
        vm.prank(bob);
        auction.bid{value: 0.06 ether}(id);
        assertEq(_endsAt(), block.timestamp + 10);
    }

    // 5
    function test_BidAfterEndReverts() public {
        vm.warp(_endsAt());
        vm.prank(alice);
        vm.expectRevert(AqadLelang.AuctionEnded.selector);
        auction.bid{value: 0.05 ether}(id);
    }

    // 6
    function test_SettleOnce() public {
        vm.prank(alice);
        auction.bid{value: 0.05 ether}(id);

        vm.expectRevert(AqadLelang.NotEnded.selector);
        auction.settle(id);

        vm.warp(_endsAt());
        uint256 before = seller.balance;
        vm.expectEmit(true, true, true, true);
        emit Settled(id, alice, 0.05 ether);
        vm.prank(bob); // anyone can settle
        auction.settle(id);

        assertEq(nft.ownerOf(1), alice);
        assertEq(seller.balance, before + 0.05 ether);
        assertEq(address(auction).balance, 0);

        vm.expectRevert(AqadLelang.AlreadySettled.selector);
        auction.settle(id);
    }

    // 7
    function test_SettleNoBids() public {
        vm.warp(_endsAt());
        vm.expectEmit(true, true, true, true);
        emit Settled(id, address(0), 0);
        auction.settle(id);
        assertEq(nft.ownerOf(1), seller);
    }

    // 8
    function test_RejectingBidderGetsOwed() public {
        Rejecter r = new Rejecter(auction);
        vm.deal(address(this), 1 ether);
        r.bid{value: 0.05 ether}(id);

        vm.prank(bob);
        auction.bid{value: 0.06 ether}(id); // must not revert
        assertEq(auction.owed(address(r)), 0.05 ether);
        (address top,) = _top();
        assertEq(top, bob);

        r.setAccept(true);
        r.withdraw();
        assertEq(auction.owed(address(r)), 0);
        assertEq(address(r).balance, 0.05 ether);

        vm.expectRevert(AqadLelang.NothingOwed.selector);
        r.withdraw();
    }

    function test_Cancel() public {
        vm.prank(alice);
        vm.expectRevert(AqadLelang.NotSeller.selector);
        auction.cancel(id);

        vm.prank(seller);
        auction.cancel(id);
        assertEq(nft.ownerOf(1), seller);

        vm.prank(alice);
        vm.expectRevert(AqadLelang.AuctionEnded.selector);
        auction.bid{value: 0.05 ether}(id);
    }

    function test_CancelAfterBidReverts() public {
        vm.prank(alice);
        auction.bid{value: 0.05 ether}(id);
        vm.prank(seller);
        vm.expectRevert(AqadLelang.HasBids.selector);
        auction.cancel(id);
    }
}
