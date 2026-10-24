// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title AuctionHouse — English auctions for ERC-721 tokens, paid in native MON
/// @notice Sellers escrow an NFT, bidders send native MON, outbid bidders withdraw their
///         refund (pull payment), and anyone can settle an auction after its deadline.
/// @dev    UNAUDITED. TESTNET ONLY. There is deliberately no owner, admin, pause, upgrade,
///         or asset-recovery function: nobody can move escrowed NFTs or MON outside the
///         auction rules below.
///
///         Accounting invariant (checked in the test suite):
///           address(this).balance >= Σ highestBid of Active auctions + Σ pendingReturns
///         Equality holds unless someone force-sends MON (e.g. via SELFDESTRUCT); such
///         unsolicited MON is never credited to anyone and cannot be withdrawn.
contract AuctionHouse is ReentrancyGuard, IERC721Receiver {
    // ---------------------------------------------------------------------
    // Types & storage
    // ---------------------------------------------------------------------

    /// @notice Lifecycle of an auction. `Ended` means settled on-chain, not merely expired.
    enum Status {
        Active,
        Ended,
        Cancelled
    }

    /// @notice One auction lot. `highestBid` is MON held in escrow by this contract.
    struct Auction {
        address seller;
        address nft;
        uint256 tokenId;
        uint256 minPrice;
        uint256 highestBid;
        address highestBidder;
        uint64 endTime;
        Status status;
    }

    /// @notice A bid placed with less than this much time left extends the deadline.
    uint64 public constant EXTENSION_WINDOW = 60 seconds;
    /// @notice After a late bid, the auction ends this long after that bid's block.
    uint64 public constant EXTENSION = 60 seconds;
    /// @notice Each new bid must beat the previous one by at least 5% (rounded up).
    uint256 public constant MIN_INCREMENT_BPS = 500;
    uint256 private constant BPS = 10_000;

    /// @notice ID assigned to the next auction. IDs start at 1, so `auctions[0]` is never used.
    uint256 public nextAuctionId = 1;
    /// @notice Auction data by ID. A zero `seller` means the auction does not exist.
    mapping(uint256 => Auction) public auctions;
    /// @notice Block in which each auction was created. Lets frontends read the
    ///         auction's `BidPlaced` logs over a bounded block range.
    mapping(uint256 => uint256) public createdAtBlock;
    /// @notice MON that outbid bidders can withdraw with `withdraw()`.
    mapping(address => uint256) public pendingReturns;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event AuctionCreated(
        uint256 indexed id,
        address indexed seller,
        address indexed nft,
        uint256 tokenId,
        uint256 minPrice,
        uint64 endTime
    );
    event BidPlaced(uint256 indexed id, address indexed bidder, uint256 amount, uint64 newEndTime);
    event Withdrawn(address indexed account, uint256 amount);
    event AuctionEnded(uint256 indexed id, address indexed winner, uint256 amount);
    event AuctionCancelled(uint256 indexed id);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error InvalidNFT(address nft);
    error ZeroMinPrice();
    error ZeroDuration();
    error DurationTooLong(uint64 duration);
    error NotTokenOwner(address caller, address owner);
    error NotApprovedForTransfer();
    error EscrowFailed();
    error UnsolicitedNFT();
    error AuctionNotFound(uint256 id);
    error AuctionNotActive(uint256 id, Status status);
    error AuctionExpired(uint256 id, uint64 endTime);
    error AuctionNotYetEnded(uint256 id, uint64 endTime);
    error SellerCannotBid();
    error AlreadyHighestBidder();
    error BidTooLow(uint256 amount, uint256 required);
    error NotSeller(address caller);
    error AuctionHasBids(uint256 id);
    error NothingToWithdraw();
    error TransferFailed(address to, uint256 amount);

    // ---------------------------------------------------------------------
    // Seller actions
    // ---------------------------------------------------------------------

    /// @notice List an NFT you own. Approve this contract for the token first
    ///         (`approve` or `setApprovalForAll`); the NFT is moved into escrow.
    /// @param nft      ERC-721 contract address.
    /// @param tokenId  Token to auction.
    /// @param minPrice Minimum first bid, in wei. Must be > 0.
    /// @param duration Auction length in seconds from this block. Must be > 0.
    /// @return id      The new auction ID (also emitted in `AuctionCreated`).
    function createAuction(address nft, uint256 tokenId, uint256 minPrice, uint64 duration)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (minPrice == 0) revert ZeroMinPrice();
        if (duration == 0) revert ZeroDuration();
        // Rejecting address(this) stops the house from listing NFTs it already escrows.
        if (nft == address(this) || nft.code.length == 0 || !_supportsERC721(nft)) {
            revert InvalidNFT(nft);
        }

        uint256 end = block.timestamp + duration; // cannot overflow uint256
        if (end > type(uint64).max) revert DurationTooLong(duration);

        // Ownership check: an escrowed token is owned by this contract, so it can never
        // be re-listed by a seller (the caller would not be the owner).
        address owner = IERC721(nft).ownerOf(tokenId);
        if (owner != msg.sender) revert NotTokenOwner(msg.sender, owner);
        if (
            IERC721(nft).getApproved(tokenId) != address(this)
                && !IERC721(nft).isApprovedForAll(msg.sender, address(this))
        ) revert NotApprovedForTransfer();

        // Effects before the escrow transfer. If the transfer fails the whole
        // transaction reverts, so no partially created auction can exist.
        id = nextAuctionId++;
        auctions[id] = Auction({
            seller: msg.sender,
            nft: nft,
            tokenId: tokenId,
            minPrice: minPrice,
            highestBid: 0,
            highestBidder: address(0),
            // forge-lint: disable-next-line(unsafe-typecast) bounded by the check above
            endTime: uint64(end),
            status: Status.Active
        });
        createdAtBlock[id] = block.number;
        // Events are emitted before external calls; a revert below discards them too.
        // forge-lint: disable-next-line(unsafe-typecast) bounded by the check above
        emit AuctionCreated(id, msg.sender, nft, tokenId, minPrice, uint64(end));

        IERC721(nft).safeTransferFrom(msg.sender, address(this), tokenId);
        // Do not trust a possibly malicious NFT contract: confirm escrow actually happened.
        if (IERC721(nft).ownerOf(tokenId) != address(this)) revert EscrowFailed();
    }

    /// @notice Cancel your own auction while it has no bids. Returns the NFT to you.
    /// @param id Auction ID.
    function cancelAuction(uint256 id) external nonReentrant {
        Auction storage a = _existing(id);
        if (msg.sender != a.seller) revert NotSeller(msg.sender);
        if (a.status != Status.Active) revert AuctionNotActive(id, a.status);
        if (a.highestBidder != address(0)) revert AuctionHasBids(id);

        a.status = Status.Cancelled; // effect before interaction
        emit AuctionCancelled(id);
        IERC721(a.nft).safeTransferFrom(address(this), a.seller, a.tokenId);
    }

    // ---------------------------------------------------------------------
    // Bidding
    // ---------------------------------------------------------------------

    /// @notice Bid `msg.value` MON. The previous leader's bid becomes withdrawable via
    ///         `withdraw()`; no MON is sent out here, so a bidder that rejects MON
    ///         cannot block anyone else's bid.
    /// @dev    A bid with less than `EXTENSION_WINDOW` left moves the deadline to
    ///         `block.timestamp + EXTENSION` (anti-sniping). The deadline never moves earlier.
    /// @param id Auction ID.
    function bid(uint256 id) external payable nonReentrant {
        Auction storage a = _existing(id);
        if (a.status != Status.Active) revert AuctionNotActive(id, a.status);
        if (block.timestamp >= a.endTime) revert AuctionExpired(id, a.endTime);
        if (msg.sender == a.seller) revert SellerCannotBid();
        if (msg.sender == a.highestBidder) revert AlreadyHighestBidder();

        uint256 required = _minNextBid(a);
        if (msg.value < required) revert BidTooLow(msg.value, required);

        // Pull payment: credit the previous leader's full bid. The MON stays in this
        // contract, so the liability simply moves from "active bid" to "pending return".
        address previous = a.highestBidder;
        if (previous != address(0)) pendingReturns[previous] += a.highestBid;

        a.highestBidder = msg.sender;
        a.highestBid = msg.value;

        // Strictly less than the window. endTime > block.timestamp here, so no underflow.
        if (a.endTime - block.timestamp < EXTENSION_WINDOW) {
            // forge-lint: disable-next-line(unsafe-typecast) timestamps fit in uint64 until year 2^64 s
            a.endTime = uint64(block.timestamp) + EXTENSION;
        }

        emit BidPlaced(id, msg.sender, msg.value, a.endTime);
    }

    /// @notice Withdraw all MON credited to you after being outbid.
    function withdraw() external nonReentrant {
        uint256 amount = pendingReturns[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pendingReturns[msg.sender] = 0; // zero before the external call (CEI)
        emit Withdrawn(msg.sender, amount);
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        // Reverting restores the credit, so a failed transfer never erases a balance.
        if (!ok) revert TransferFailed(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Settlement
    // ---------------------------------------------------------------------

    /// @notice Settle an expired auction. Anyone may call this.
    ///         No bids: the NFT returns to the seller. Otherwise the NFT goes to the
    ///         highest bidder and the highest bid is paid to the seller.
    /// @dev    Atomic: if the NFT transfer or the seller payment fails, the whole call
    ///         reverts and the auction stays Active (nothing is partially settled).
    ///         Consequence: a seller that rejects MON, or a winning contract that cannot
    ///         receive ERC-721 tokens, blocks settlement; assets stay escrowed and
    ///         accounted for, but cannot be released. Accepted trade-off of this spec.
    /// @param id Auction ID.
    function endAuction(uint256 id) external nonReentrant {
        Auction storage a = _existing(id);
        if (a.status != Status.Active) revert AuctionNotActive(id, a.status);
        if (block.timestamp < a.endTime) revert AuctionNotYetEnded(id, a.endTime);

        a.status = Status.Ended; // blocks double settlement, including via reentrancy
        address winner = a.highestBidder;
        uint256 amount = a.highestBid;
        emit AuctionEnded(id, winner, amount);

        if (winner == address(0)) {
            IERC721(a.nft).safeTransferFrom(address(this), a.seller, a.tokenId);
        } else {
            IERC721(a.nft).safeTransferFrom(address(this), winner, a.tokenId);
            (bool ok,) = payable(a.seller).call{value: amount}("");
            if (!ok) revert TransferFailed(a.seller, amount);
        }
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Smallest bid `bid(id)` will accept right now: `minPrice` for the first bid,
    ///         otherwise `highestBid + ceil(highestBid * 5%)`.
    function minNextBid(uint256 id) external view returns (uint256) {
        return _minNextBid(_existing(id));
    }

    /// @notice Only accepts NFTs this contract pulls in itself during `createAuction`.
    /// @dev    Direct `safeTransferFrom` deposits are rejected so tokens cannot be
    ///         stranded here without an auction (there is no recovery function).
    function onERC721Received(address operator, address, uint256, bytes calldata)
        external
        view
        returns (bytes4)
    {
        if (operator != address(this)) revert UnsolicitedNFT();
        return IERC721Receiver.onERC721Received.selector;
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _existing(uint256 id) private view returns (Auction storage a) {
        a = auctions[id];
        if (a.seller == address(0)) revert AuctionNotFound(id);
    }

    function _minNextBid(Auction storage a) private view returns (uint256) {
        uint256 current = a.highestBid;
        if (current == 0) return a.minPrice; // minPrice > 0, so 0 always means "no bids"
        // mulDiv avoids overflow in the multiplication; Ceil means 5% is never under-charged.
        return current + Math.mulDiv(current, MIN_INCREMENT_BPS, BPS, Math.Rounding.Ceil);
    }

    function _supportsERC721(address nft) private view returns (bool) {
        try IERC165(nft).supportsInterface(type(IERC721).interfaceId) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }
}
