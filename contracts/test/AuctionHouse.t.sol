// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {AuctionHouse} from "../src/AuctionHouse.sol";
import {DemoNFT} from "../src/DemoNFT.sol";
import {
    HostileBidder, PlainContract, RejectingSeller, FakeEscrowNFT, ReentrantNFT, ForceSender
} from "./Mocks.sol";

contract AuctionHouseTest is Test {
    AuctionHouse house;
    DemoNFT nft;

    address seller = makeAddr("seller");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    uint256 constant MIN = 1 ether;
    uint64 constant DURATION = 5 minutes;

    event AuctionCreated(
        uint256 indexed id, address indexed seller, address indexed nft, uint256 tokenId, uint256 minPrice, uint64 endTime
    );
    event BidPlaced(uint256 indexed id, address indexed bidder, uint256 amount, uint64 newEndTime);
    event Withdrawn(address indexed account, uint256 amount);
    event AuctionEnded(uint256 indexed id, address indexed winner, uint256 amount);
    event AuctionCancelled(uint256 indexed id);

    function setUp() public {
        vm.warp(1_700_000_000);
        house = new AuctionHouse();
        nft = new DemoNFT();
        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);
        vm.deal(carol, 1000 ether);
    }

    // ------------------------------------------------------------------ helpers

    function _mintAndList(uint256 minPrice, uint64 duration) internal returns (uint256 id, uint256 tokenId) {
        tokenId = nft.mint(seller);
        vm.startPrank(seller);
        nft.approve(address(house), tokenId);
        id = house.createAuction(address(nft), tokenId, minPrice, duration);
        vm.stopPrank();
    }

    function _list() internal returns (uint256 id, uint256 tokenId) {
        return _mintAndList(MIN, DURATION);
    }

    function _bid(address who, uint256 id, uint256 amount) internal {
        vm.prank(who);
        house.bid{value: amount}(id);
    }

    function _auction(uint256 id) internal view returns (AuctionHouse.Auction memory a) {
        (a.seller, a.nft, a.tokenId, a.minPrice, a.highestBid, a.highestBidder, a.endTime, a.status) =
            house.auctions(id);
    }

    // ------------------------------------------------------------------ 1. create

    function test_CreateEscrowsNftAndStoresFields() public {
        uint256 tokenId = nft.mint(seller);
        vm.startPrank(seller);
        nft.approve(address(house), tokenId);
        uint64 expectedEnd = uint64(block.timestamp) + DURATION;
        vm.expectEmit(true, true, true, true, address(house));
        emit AuctionCreated(1, seller, address(nft), tokenId, MIN, expectedEnd);
        uint256 id = house.createAuction(address(nft), tokenId, MIN, DURATION);
        vm.stopPrank();

        assertEq(id, 1);
        assertEq(house.nextAuctionId(), 2);
        assertEq(nft.ownerOf(tokenId), address(house));
        assertEq(house.createdAtBlock(id), block.number);
        AuctionHouse.Auction memory a = _auction(id);
        assertEq(a.seller, seller);
        assertEq(a.nft, address(nft));
        assertEq(a.tokenId, tokenId);
        assertEq(a.minPrice, MIN);
        assertEq(a.highestBid, 0);
        assertEq(a.highestBidder, address(0));
        assertEq(a.endTime, expectedEnd);
        assertEq(uint8(a.status), uint8(AuctionHouse.Status.Active));
    }

    function test_CreateWithOperatorApproval() public {
        uint256 tokenId = nft.mint(seller);
        vm.startPrank(seller);
        nft.setApprovalForAll(address(house), true);
        uint256 id = house.createAuction(address(nft), tokenId, MIN, DURATION);
        vm.stopPrank();
        assertEq(nft.ownerOf(tokenId), address(house));
        assertEq(id, 1);
    }

    function test_CreateRequiresApproval() public {
        uint256 tokenId = nft.mint(seller);
        vm.prank(seller);
        vm.expectRevert(AuctionHouse.NotApprovedForTransfer.selector);
        house.createAuction(address(nft), tokenId, MIN, DURATION);
        assertEq(house.nextAuctionId(), 1);
    }

    function test_CreateRequiresOwnership() public {
        uint256 tokenId = nft.mint(seller);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.NotTokenOwner.selector, alice, seller));
        house.createAuction(address(nft), tokenId, MIN, DURATION);
    }

    function test_CannotRelistEscrowedNft() public {
        (, uint256 tokenId) = _list();
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.NotTokenOwner.selector, seller, address(house)));
        house.createAuction(address(nft), tokenId, MIN, DURATION);
    }

    // 21. invalid inputs
    function test_CreateRejectsInvalidInputs() public {
        uint256 tokenId = nft.mint(seller);
        vm.startPrank(seller);
        nft.approve(address(house), tokenId);

        vm.expectRevert(AuctionHouse.ZeroMinPrice.selector);
        house.createAuction(address(nft), tokenId, 0, DURATION);

        vm.expectRevert(AuctionHouse.ZeroDuration.selector);
        house.createAuction(address(nft), tokenId, MIN, 0);

        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.InvalidNFT.selector, address(0)));
        house.createAuction(address(0), tokenId, MIN, DURATION);

        address eoa = makeAddr("eoa");
        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.InvalidNFT.selector, eoa));
        house.createAuction(eoa, tokenId, MIN, DURATION);

        // A contract that is not an ERC-721 (no supportsInterface).
        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.InvalidNFT.selector, address(this)));
        house.createAuction(address(this), tokenId, MIN, DURATION);

        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.InvalidNFT.selector, address(house)));
        house.createAuction(address(house), tokenId, MIN, DURATION);

        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.DurationTooLong.selector, type(uint64).max));
        house.createAuction(address(nft), tokenId, MIN, type(uint64).max);
        vm.stopPrank();

        assertEq(house.nextAuctionId(), 1);
        assertEq(nft.ownerOf(tokenId), seller);
    }

    function test_CreateRevertsIfEscrowDidNotHappen() public {
        FakeEscrowNFT fake = new FakeEscrowNFT();
        fake.mint(seller, 1);
        vm.startPrank(seller);
        fake.approve(address(house), 1);
        vm.expectRevert(AuctionHouse.EscrowFailed.selector);
        house.createAuction(address(fake), 1, MIN, DURATION);
        vm.stopPrank();
        assertEq(house.nextAuctionId(), 1, "no partial auction");
        (address s,,,,,,,) = house.auctions(1);
        assertEq(s, address(0));
    }

    function test_RejectsUnsolicitedNftDeposits() public {
        uint256 tokenId = nft.mint(alice);
        vm.prank(alice);
        vm.expectRevert(AuctionHouse.UnsolicitedNFT.selector); // OZ bubbles up the hook's reason
        nft.safeTransferFrom(alice, address(house), tokenId);
    }

    // ------------------------------------------------------------------ 2-4. bidding

    function test_FirstBidBelowMinReverts() public {
        (uint256 id,) = _list();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.BidTooLow.selector, MIN - 1, MIN));
        house.bid{value: MIN - 1}(id);
    }

    function test_FirstBidAtMinSetsLeader() public {
        (uint256 id,) = _list();
        vm.expectEmit(true, true, false, true, address(house));
        emit BidPlaced(id, alice, MIN, _auction(id).endTime);
        _bid(alice, id, MIN);
        AuctionHouse.Auction memory a = _auction(id);
        assertEq(a.highestBidder, alice);
        assertEq(a.highestBid, MIN);
        assertEq(address(house).balance, MIN);
        assertEq(house.pendingReturns(alice), 0);
    }

    function test_OutbidCreditsPreviousBidderInFull() public {
        (uint256 id,) = _list();
        _bid(alice, id, MIN);
        uint256 aliceBefore = alice.balance;
        _bid(bob, id, 2 ether);

        AuctionHouse.Auction memory a = _auction(id);
        assertEq(a.highestBidder, bob);
        assertEq(a.highestBid, 2 ether);
        assertEq(house.pendingReturns(alice), MIN, "full previous bid credited");
        assertEq(alice.balance, aliceBefore, "no push refund inside bid()");
        assertEq(address(house).balance, MIN + 2 ether);
    }

    // 5-6. withdraw
    function test_WithdrawPaysFullRefundOnce() public {
        (uint256 id,) = _list();
        _bid(alice, id, MIN);
        _bid(bob, id, 2 ether);

        uint256 before = alice.balance;
        vm.expectEmit(true, false, false, true, address(house));
        emit Withdrawn(alice, MIN);
        vm.prank(alice);
        house.withdraw();
        assertEq(alice.balance, before + MIN);
        assertEq(house.pendingReturns(alice), 0);

        vm.prank(alice);
        vm.expectRevert(AuctionHouse.NothingToWithdraw.selector);
        house.withdraw();
    }

    function test_RefundsAccumulateAcrossAuctions() public {
        (uint256 id1,) = _list();
        (uint256 id2,) = _list();
        _bid(alice, id1, MIN);
        _bid(alice, id2, MIN);
        _bid(bob, id1, 2 ether);
        _bid(bob, id2, 2 ether);
        assertEq(house.pendingReturns(alice), 2 * MIN);
    }

    // 7-8. bidder eligibility
    function test_SellerCannotBid() public {
        (uint256 id,) = _list();
        vm.deal(seller, 10 ether);
        vm.prank(seller);
        vm.expectRevert(AuctionHouse.SellerCannotBid.selector);
        house.bid{value: MIN}(id);
    }

    function test_HighestBidderCannotBidAgain() public {
        (uint256 id,) = _list();
        _bid(alice, id, MIN);
        vm.prank(alice);
        vm.expectRevert(AuctionHouse.AlreadyHighestBidder.selector);
        house.bid{value: 5 ether}(id);
        // An outbid bidder may bid again.
        _bid(bob, id, 2 ether);
        _bid(alice, id, 3 ether);
        assertEq(_auction(id).highestBidder, alice);
    }

    // 9. minimum increment with rounding
    function test_MinIncrementRoundsUp() public {
        // 1 ether + 1 wei is not divisible by 20: 5% = 0.05 ether + 0.05 wei -> rounds up to +1 wei.
        (uint256 id,) = _mintAndList(1 ether + 1, DURATION);
        _bid(alice, id, 1 ether + 1);
        uint256 required = (1 ether + 1) + 0.05 ether + 1;
        assertEq(house.minNextBid(id), required);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.BidTooLow.selector, required - 1, required));
        house.bid{value: required - 1}(id);

        _bid(bob, id, required);
        assertEq(_auction(id).highestBid, required);
    }

    function test_MinIncrementSmallAmounts() public {
        // 199 wei * 5% = 9.95 -> 10 ; 200 wei -> exactly 10 ; 1 wei -> 0.05 -> 1
        (uint256 id,) = _mintAndList(1, DURATION);
        assertEq(house.minNextBid(id), 1, "first bid uses minPrice");
        _bid(alice, id, 1);
        assertEq(house.minNextBid(id), 2);
        _bid(bob, id, 199);
        assertEq(house.minNextBid(id), 209);
        _bid(carol, id, 209);
        _bid(alice, id, 220); // 209 + ceil(10.45)=11 -> 220
        assertEq(house.minNextBid(id), 231);
    }

    function test_MinNextBidUnknownReverts() public {
        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.AuctionNotFound.selector, 99));
        house.minNextBid(99);
    }

    // ------------------------------------------------------------------ 10-13. time

    function test_BidInsideWindowExtends() public {
        (uint256 id,) = _list();
        uint64 end = _auction(id).endTime;
        vm.warp(end - 30);
        _bid(alice, id, MIN);
        assertEq(_auction(id).endTime, uint64(block.timestamp) + 60);
        assertGt(_auction(id).endTime, end);
    }

    function test_BidOutsideWindowDoesNotExtend() public {
        (uint256 id,) = _list();
        uint64 end = _auction(id).endTime;
        vm.warp(end - 120);
        _bid(alice, id, MIN);
        assertEq(_auction(id).endTime, end);
    }

    function test_ExtensionBoundary() public {
        (uint256 id,) = _list();
        uint64 end = _auction(id).endTime;

        // Exactly 60 s left: NOT strictly less than the window -> no extension.
        vm.warp(end - 60);
        _bid(alice, id, MIN);
        assertEq(_auction(id).endTime, end);

        // 59 s left -> extends to now + 60 (= old end + 1).
        vm.warp(end - 59);
        _bid(bob, id, 2 ether);
        assertEq(_auction(id).endTime, end + 1);

        // Last valid second -> extends again.
        uint64 end2 = _auction(id).endTime;
        vm.warp(end2 - 1);
        _bid(carol, id, 3 ether);
        assertEq(_auction(id).endTime, end2 - 1 + 60);
    }

    function test_BidAtOrAfterDeadlineReverts() public {
        (uint256 id,) = _list();
        uint64 end = _auction(id).endTime;
        vm.warp(end);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.AuctionExpired.selector, id, end));
        house.bid{value: MIN}(id);
    }

    function test_EndBeforeDeadlineReverts() public {
        (uint256 id,) = _list();
        uint64 end = _auction(id).endTime;
        vm.warp(end - 1);
        vm.prank(carol); // only the seller may end early
        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.AuctionNotYetEnded.selector, id, end));
        house.endAuction(id);
    }

    function test_SellerEndsEarlyAcceptingTopBid() public {
        (uint256 id, uint256 tokenId) = _list();
        _bid(alice, id, MIN);
        _bid(bob, id, 2 ether);
        vm.warp(_auction(id).endTime - 100);

        vm.prank(seller);
        house.endAuction(id);

        assertEq(nft.ownerOf(tokenId), bob);
        assertEq(seller.balance, 2 ether);
        assertEq(uint8(_auction(id).status), uint8(AuctionHouse.Status.Ended));
        assertEq(house.pendingReturns(alice), MIN, "outbid refund untouched");

        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.AuctionNotActive.selector, id, AuctionHouse.Status.Ended));
        house.bid{value: 3 ether}(id);
    }

    function test_SellerEndsEarlyWithNoBidsReturnsNft() public {
        (uint256 id, uint256 tokenId) = _list();
        vm.prank(seller);
        house.endAuction(id);
        assertEq(nft.ownerOf(tokenId), seller);
        assertEq(uint8(_auction(id).status), uint8(AuctionHouse.Status.Ended));
    }

    // ------------------------------------------------------------------ 15-16. settlement

    function test_SettleWithBidsPaysSellerAndTransfersNft() public {
        (uint256 id, uint256 tokenId) = _list();
        _bid(alice, id, MIN);
        _bid(bob, id, 2 ether);
        vm.warp(_auction(id).endTime);

        vm.expectEmit(true, true, false, true, address(house));
        emit AuctionEnded(id, bob, 2 ether);
        vm.prank(carol); // permissionless
        house.endAuction(id);

        assertEq(nft.ownerOf(tokenId), bob);
        assertEq(seller.balance, 2 ether);
        assertEq(uint8(_auction(id).status), uint8(AuctionHouse.Status.Ended));
        assertEq(address(house).balance, MIN, "only alice's refund remains");
        assertEq(house.pendingReturns(alice), MIN);
    }

    function test_SettleWithoutBidsReturnsNft() public {
        (uint256 id, uint256 tokenId) = _list();
        vm.warp(_auction(id).endTime);
        vm.expectEmit(true, true, false, true, address(house));
        emit AuctionEnded(id, address(0), 0);
        house.endAuction(id);
        assertEq(nft.ownerOf(tokenId), seller);
        assertEq(seller.balance, 0);
    }

    // 19 & 26. no double settlement
    function test_CannotSettleTwice() public {
        (uint256 id, uint256 tokenId) = _list();
        _bid(alice, id, MIN);
        vm.warp(_auction(id).endTime);
        house.endAuction(id);

        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.AuctionNotActive.selector, id, AuctionHouse.Status.Ended));
        house.endAuction(id);
        assertEq(seller.balance, MIN, "paid exactly once");
        assertEq(nft.ownerOf(tokenId), alice);
    }

    // ------------------------------------------------------------------ 17-18, 25. cancel

    function test_CancelBeforeBidReturnsNft() public {
        (uint256 id, uint256 tokenId) = _list();
        vm.expectEmit(true, false, false, false, address(house));
        emit AuctionCancelled(id);
        vm.prank(seller);
        house.cancelAuction(id);
        assertEq(nft.ownerOf(tokenId), seller);
        assertEq(uint8(_auction(id).status), uint8(AuctionHouse.Status.Cancelled));

        // Cancelled auctions cannot be bid on, settled, or cancelled again.
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(AuctionHouse.AuctionNotActive.selector, id, AuctionHouse.Status.Cancelled)
        );
        house.bid{value: MIN}(id);
        vm.warp(_auction(id).endTime);
        vm.expectRevert(
            abi.encodeWithSelector(AuctionHouse.AuctionNotActive.selector, id, AuctionHouse.Status.Cancelled)
        );
        house.endAuction(id);
        vm.prank(seller);
        vm.expectRevert(
            abi.encodeWithSelector(AuctionHouse.AuctionNotActive.selector, id, AuctionHouse.Status.Cancelled)
        );
        house.cancelAuction(id);
    }

    function test_CancelAfterBidReverts() public {
        (uint256 id,) = _list();
        _bid(alice, id, MIN);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.AuctionHasBids.selector, id));
        house.cancelAuction(id);
    }

    function test_OnlySellerCanCancel() public {
        (uint256 id,) = _list();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.NotSeller.selector, alice));
        house.cancelAuction(id);
    }

    function test_CannotCancelEndedAuction() public {
        (uint256 id,) = _list();
        vm.warp(_auction(id).endTime);
        house.endAuction(id);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.AuctionNotActive.selector, id, AuctionHouse.Status.Ended));
        house.cancelAuction(id);
    }

    // 20. unknown ids
    function test_UnknownAuctionReverts() public {
        bytes memory err = abi.encodeWithSelector(AuctionHouse.AuctionNotFound.selector, 0);
        vm.expectRevert(err);
        house.bid{value: 1}(0);
        err = abi.encodeWithSelector(AuctionHouse.AuctionNotFound.selector, 7);
        vm.expectRevert(err);
        house.endAuction(7);
        vm.expectRevert(err);
        house.cancelAuction(7);
    }

    // ------------------------------------------------------------------ 22-24. hostile actors

    function test_RejectingBidderDoesNotBlockOutbid() public {
        (uint256 id,) = _list();
        HostileBidder h = new HostileBidder(house);
        h.setRejectMon(true);
        h.bid{value: MIN}(id);
        _bid(alice, id, 2 ether); // succeeds: no push refund
        assertEq(house.pendingReturns(address(h)), MIN);
    }

    function test_FailedWithdrawKeepsBalance() public {
        (uint256 id,) = _list();
        HostileBidder h = new HostileBidder(house);
        h.bid{value: MIN}(id);
        _bid(alice, id, 2 ether);

        h.setRejectMon(true);
        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.TransferFailed.selector, address(h), MIN));
        h.withdraw();
        assertEq(house.pendingReturns(address(h)), MIN, "credit preserved");
        assertEq(address(house).balance, MIN + 2 ether);

        h.setRejectMon(false);
        h.withdraw();
        assertEq(address(h).balance, MIN);
        assertEq(house.pendingReturns(address(h)), 0);
    }

    function test_ReentrantWithdrawCannotDoublePay() public {
        (uint256 id,) = _list();
        HostileBidder h = new HostileBidder(house);
        h.bid{value: MIN}(id);
        _bid(alice, id, 2 ether);

        h.setReenterWithdraw(true);
        // Inner withdraw hits the guard -> receive() reverts -> outer call fails -> credit restored.
        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.TransferFailed.selector, address(h), MIN));
        h.withdraw();
        assertEq(house.pendingReturns(address(h)), MIN);
        assertEq(address(house).balance, MIN + 2 ether);
    }

    function test_ReentrantWinnerCannotDoubleSettle() public {
        (uint256 id, uint256 tokenId) = _list();
        HostileBidder h = new HostileBidder(house);
        h.bid{value: MIN}(id);
        h.setReenterEnd(true, id);
        vm.warp(_auction(id).endTime);

        // The receiver hook re-enters endAuction -> guard reverts -> whole settlement reverts.
        vm.expectRevert();
        house.endAuction(id);
        assertEq(uint8(_auction(id).status), uint8(AuctionHouse.Status.Active), "atomic: still active");
        assertEq(nft.ownerOf(tokenId), address(house));
        assertEq(seller.balance, 0);

        // Once the hook behaves, a single settlement succeeds.
        h.setReenterEnd(false, 0);
        house.endAuction(id);
        assertEq(nft.ownerOf(tokenId), address(h));
        assertEq(seller.balance, MIN);
    }

    function test_ReentrantNftCannotDoubleSettle() public {
        ReentrantNFT rnft = new ReentrantNFT();
        rnft.mint(seller, 1);
        vm.startPrank(seller);
        rnft.approve(address(house), 1);
        uint256 id = house.createAuction(address(rnft), 1, MIN, DURATION);
        vm.stopPrank();
        _bid(alice, id, MIN);
        vm.warp(_auction(id).endTime);

        rnft.arm(house, id);
        house.endAuction(id);
        assertFalse(rnft.reentrySucceeded(), "inner endAuction must fail");
        assertEq(rnft.ownerOf(1), alice);
        assertEq(seller.balance, MIN, "seller paid once");
        assertEq(address(house).balance, 0);
    }

    function test_WinnerWithoutReceiverBlocksSettlementAtomically() public {
        (uint256 id, uint256 tokenId) = _list();
        PlainContract pc = new PlainContract();
        pc.bid{value: MIN}(house, id);
        vm.warp(_auction(id).endTime);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, address(pc)));
        house.endAuction(id);
        // Documented limitation: nothing moved, everything still escrowed and accounted.
        assertEq(uint8(_auction(id).status), uint8(AuctionHouse.Status.Active));
        assertEq(nft.ownerOf(tokenId), address(house));
        assertEq(address(house).balance, MIN);
    }

    function test_FailedSellerPaymentRevertsSettlement() public {
        RejectingSeller rs = new RejectingSeller();
        uint256 tokenId = nft.mint(address(rs));
        uint256 id = rs.list(house, nft, tokenId, MIN, DURATION);
        _bid(alice, id, MIN);
        vm.warp(_auction(id).endTime);

        vm.expectRevert(abi.encodeWithSelector(AuctionHouse.TransferFailed.selector, address(rs), MIN));
        house.endAuction(id);
        assertEq(uint8(_auction(id).status), uint8(AuctionHouse.Status.Active), "not partially settled");
        assertEq(nft.ownerOf(tokenId), address(house), "NFT not released");
        assertEq(address(house).balance, MIN, "bid still escrowed");
    }

    function test_ForcedMonDoesNotBreakAccounting() public {
        (uint256 id,) = _list();
        _bid(alice, id, MIN);
        _bid(bob, id, 2 ether);
        new ForceSender{value: 0.5 ether}(payable(address(house)));
        assertEq(address(house).balance, MIN + 2 ether + 0.5 ether);

        vm.prank(alice);
        house.withdraw();
        vm.warp(_auction(id).endTime);
        house.endAuction(id);
        // Liabilities are zero; the forced 0.5 MON is unallocated and harmless.
        assertEq(address(house).balance, 0.5 ether);
        assertEq(house.pendingReturns(alice), 0);
        assertEq(seller.balance, 2 ether);
    }

    function test_PlainMonTransferIsRejected() public {
        vm.prank(alice);
        (bool ok,) = address(house).call{value: 1 ether}("");
        assertFalse(ok, "no receive/fallback: stray MON cannot be sent normally");
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_FirstBid(uint256 minPrice, uint256 amount) public {
        minPrice = bound(minPrice, 1, 100 ether);
        amount = bound(amount, 0, 200 ether);
        (uint256 id,) = _mintAndList(minPrice, DURATION);
        vm.prank(alice);
        if (amount < minPrice) {
            vm.expectRevert(abi.encodeWithSelector(AuctionHouse.BidTooLow.selector, amount, minPrice));
            house.bid{value: amount}(id);
        } else {
            house.bid{value: amount}(id);
            assertEq(_auction(id).highestBid, amount);
        }
    }

    function testFuzz_MinIncrementMatchesCeilFormula(uint256 first, uint256 second) public {
        first = bound(first, 1, 500 ether);
        (uint256 id,) = _mintAndList(1, DURATION);
        _bid(alice, id, first);
        uint256 inc = (first * 500 + 9_999) / 10_000; // ceil(first * 5%)
        uint256 required = first + inc;
        assertEq(house.minNextBid(id), required);
        assertGe(required * 10_000, first * 10_500, "never below +5%");

        second = bound(second, 0, 1000 ether);
        vm.prank(bob);
        if (second < required) {
            vm.expectRevert(abi.encodeWithSelector(AuctionHouse.BidTooLow.selector, second, required));
            house.bid{value: second}(id);
        } else {
            house.bid{value: second}(id);
            assertEq(house.pendingReturns(alice), first);
        }
    }

    function testFuzz_HugeBidsDoNotOverflowThreshold(uint256 first) public {
        first = bound(first, 1, type(uint256).max / 2);
        (uint256 id,) = _mintAndList(1, DURATION);
        vm.deal(alice, first);
        _bid(alice, id, first);
        uint256 required = house.minNextBid(id); // mulDiv: no overflow in the multiplication
        assertGt(required, first);
    }

    function testFuzz_Duration(uint64 duration) public {
        uint256 tokenId = nft.mint(seller);
        vm.startPrank(seller);
        nft.approve(address(house), tokenId);
        if (duration == 0) {
            vm.expectRevert(AuctionHouse.ZeroDuration.selector);
            house.createAuction(address(nft), tokenId, MIN, duration);
        } else if (uint256(block.timestamp) + duration > type(uint64).max) {
            vm.expectRevert(abi.encodeWithSelector(AuctionHouse.DurationTooLong.selector, duration));
            house.createAuction(address(nft), tokenId, MIN, duration);
        } else {
            uint256 id = house.createAuction(address(nft), tokenId, MIN, duration);
            assertEq(_auction(id).endTime, uint64(block.timestamp) + duration);
        }
        vm.stopPrank();
    }

    function testFuzz_ExtensionNeverShortens(uint64 offset) public {
        (uint256 id,) = _list();
        uint64 end = _auction(id).endTime;
        offset = uint64(bound(offset, 1, DURATION));
        vm.warp(end - offset);
        _bid(alice, id, MIN);
        uint64 newEnd = _auction(id).endTime;
        assertGe(newEnd, end);
        if (offset < 60) assertEq(newEnd, uint64(block.timestamp) + 60);
        else assertEq(newEnd, end);
    }

    // ------------------------------------------------------------------ deterministic accounting

    /// Controlled scenario with no forced MON: balance == active bids + pending returns, exactly,
    /// at every step. Seller proceeds and withdrawals leave the contract.
    function test_AccountingExactAcrossLifecycle() public {
        (uint256 id1,) = _list();
        (uint256 id2,) = _list();
        _check(0, 0);
        _bid(alice, id1, 1 ether);
        _check(1 ether, 0);
        _bid(bob, id1, 2 ether);
        _check(2 ether, 1 ether);
        _bid(alice, id2, 1 ether);
        _check(3 ether, 1 ether);
        _bid(carol, id2, 1.05 ether);
        _check(3.05 ether, 2 ether);
        vm.prank(alice);
        house.withdraw();
        _check(3.05 ether, 0);
        vm.warp(_auction(id1).endTime);
        house.endAuction(id1);
        _check(1.05 ether, 0);
        house.endAuction(id2);
        _check(0, 0);
        assertEq(seller.balance, 3.05 ether);
        assertEq(address(house).balance, 0);
    }

    function _check(uint256 activeBids, uint256 refunds) internal view {
        uint256 pending = house.pendingReturns(alice) + house.pendingReturns(bob) + house.pendingReturns(carol);
        assertEq(pending, refunds, "pending returns");
        assertEq(address(house).balance, activeBids + refunds, "balance == liabilities");
    }
}
