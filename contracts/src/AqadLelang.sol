// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AqadLelang
/// @notice A live English auction paid in native MON. Every bid locks real MON in this
///         contract. When someone outbids you, your MON comes back in the same transaction.
///         When the clock ends, one `settle()` sends the NFT to the winner and the MON to the
///         seller. So there is no "bid and run": the bid *is* the payment.
contract AqadLelang is ReentrancyGuard {
    struct Auction {
        address seller;
        address nft;
        uint256 tokenId;
        uint128 reserve; // first bid must be >= reserve
        uint128 minStep; // next bid must be >= topBid + minStep
        uint64 endsAt; // unix seconds
        uint32 buffer; // anti-snipe window in seconds, e.g. 10
        address topBidder;
        uint128 topBid;
        bool settled; // also true after cancel
    }

    mapping(uint256 => Auction) public auctions;
    /// @notice MON we tried to send but couldn't (e.g. the receiver is a contract that
    ///         rejects payments). The owner pulls it with `withdraw()`.
    mapping(address => uint256) public owed;
    /// @notice Id of the newest auction. Ids start at 1, so 0 means "no auction yet".
    uint256 public lastId;

    /// Gas forwarded when pushing MON to someone. Enough for a normal wallet, too little
    /// for a malicious contract to do anything expensive (or re-enter usefully).
    uint256 private constant PUSH_GAS = 30_000;

    event AuctionCreated(
        uint256 indexed id, address indexed seller, address nft, uint256 tokenId, uint128 reserve, uint128 minStep, uint64 endsAt
    );
    event BidPlaced(
        uint256 indexed id, address indexed bidder, uint256 amount, uint64 endsAt, address indexed prevBidder, uint256 refunded
    );
    event Extended(uint256 indexed id, uint64 endsAt);
    event Settled(uint256 indexed id, address indexed winner, uint256 amount);
    event Cancelled(uint256 indexed id);

    error AuctionEnded();
    error BidTooLow(uint256 minNext);
    error NotEnded();
    error AlreadySettled();
    error NotSeller();
    error HasBids();
    error NothingOwed();
    error WithdrawFailed();

    /// @notice List an NFT. The seller must `approve` this contract for the token first.
    ///         The clock starts now: the auction ends `duration` seconds from this block.
    /// @return id The new auction's id.
    function create(address nft, uint256 tokenId, uint128 reserve, uint128 minStep, uint64 duration, uint32 buffer)
        external
        returns (uint256 id)
    {
        id = ++lastId;
        uint64 endsAt = uint64(block.timestamp) + duration;
        auctions[id] = Auction({
            seller: msg.sender,
            nft: nft,
            tokenId: tokenId,
            reserve: reserve,
            minStep: minStep,
            endsAt: endsAt,
            buffer: buffer,
            topBidder: address(0),
            topBid: 0,
            settled: false
        });
        // The contract holds the NFT until settle, so the seller can't pull it mid-auction.
        IERC721(nft).transferFrom(msg.sender, address(this), tokenId);
        emit AuctionCreated(id, msg.sender, nft, tokenId, reserve, minStep, endsAt);
    }

    /// @notice Bid the MON you send. Must be at least `minNextBid(id)`. The previous top
    ///         bidder is refunded in this same transaction.
    function bid(uint256 id) external payable nonReentrant {
        Auction storage a = auctions[id];
        if (a.settled || block.timestamp >= a.endsAt) revert AuctionEnded();
        uint256 minNext = minNextBid(id);
        if (msg.value < minNext) revert BidTooLow(minNext);

        address prevBidder = a.topBidder;
        uint256 prevBid = a.topBid;

        // Write the new state *before* moving any money (checks-effects-interactions).
        a.topBidder = msg.sender;
        a.topBid = uint128(msg.value);

        // Anti-snipe: a bid in the last `buffer` seconds pushes the end out to now + buffer,
        // so nobody can win by bidding at the final instant.
        if (a.endsAt - block.timestamp < a.buffer) {
            a.endsAt = uint64(block.timestamp) + a.buffer;
            emit Extended(id, a.endsAt);
        }

        // Refund the bidder we just beat. If their wallet refuses the payment, we don't
        // revert (that would let one bad bidder freeze the auction); we credit `owed`.
        if (prevBidder != address(0)) _pay(prevBidder, prevBid);

        emit BidPlaced(id, msg.sender, msg.value, a.endsAt, prevBidder, prevBid);
    }

    /// @notice Finish the auction. Anyone can call it once the clock has ended, exactly once.
    ///         NFT goes to the winner, MON to the seller. With no bids, the NFT goes back.
    function settle(uint256 id) external nonReentrant {
        Auction storage a = auctions[id];
        if (a.settled) revert AlreadySettled();
        if (block.timestamp < a.endsAt) revert NotEnded();
        a.settled = true;

        address winner = a.topBidder;
        // `transferFrom`, not `safeTransferFrom`: a winner contract without onERC721Received
        // can't block the sale by refusing the token.
        IERC721(a.nft).transferFrom(address(this), winner == address(0) ? a.seller : winner, a.tokenId);
        if (winner != address(0)) _pay(a.seller, a.topBid);

        emit Settled(id, winner, a.topBid);
    }

    /// @notice Pull MON that couldn't be pushed to you earlier. The safety valve.
    function withdraw() external nonReentrant {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert NothingOwed();
        owed[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
    }

    /// @notice Seller can take the lot back, but only before anyone has bid.
    function cancel(uint256 id) external {
        Auction storage a = auctions[id];
        if (msg.sender != a.seller) revert NotSeller();
        if (a.settled) revert AlreadySettled();
        if (a.topBidder != address(0)) revert HasBids();
        a.settled = true;
        IERC721(a.nft).transferFrom(address(this), a.seller, a.tokenId);
        emit Cancelled(id);
    }

    /// @notice The smallest bid that will be accepted right now.
    function minNextBid(uint256 id) public view returns (uint256) {
        Auction storage a = auctions[id];
        return a.topBid == 0 ? a.reserve : uint256(a.topBid) + a.minStep;
    }

    /// Push MON with a gas cap; if the receiver refuses, remember it in `owed` instead.
    function _pay(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount, gas: PUSH_GAS}("");
        if (!ok) owed[to] += amount;
    }
}
