// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/// @title DemoNFT — free-mint ERC-721 for local demos and Monad Testnet experiments
/// @notice ANYONE CAN MINT, FOR FREE. This is intentional for demos and makes the tokens
///         worthless as proof of anything. Never use this contract for anything of value.
///         A token minted for a physical product is only a listing record: it does not
///         prove ownership of, or deliver, the product.
contract DemoNFT is ERC721URIStorage {
    /// @notice Token ID the next mint will assign. IDs start at 1.
    uint256 public nextTokenId = 1;
    /// @notice Upper bound on metadata URI length, to keep mints cheap (Monad bills gas limit).
    uint256 public constant MAX_URI_LENGTH = 2048;

    error InvalidRecipient();
    error InvalidURI();

    constructor() ERC721("Demo NFT", "DNFT") {}

    /// @notice Mint one token without metadata (the UI shows generated placeholder art).
    /// @return tokenId The newly minted token ID.
    function mint(address to) external returns (uint256 tokenId) {
        tokenId = _mintTo(to);
    }

    /// @notice Mint one token whose `tokenURI` is `uri` — e.g. an on-chain
    ///         `data:application/json;base64,...` document with name, description, image.
    /// @return tokenId The newly minted token ID.
    function mintWithURI(address to, string calldata uri) external returns (uint256 tokenId) {
        if (bytes(uri).length == 0 || bytes(uri).length > MAX_URI_LENGTH) revert InvalidURI();
        tokenId = _mintTo(to);
        _setTokenURI(tokenId, uri);
    }

    function _mintTo(address to) private returns (uint256 tokenId) {
        if (to == address(0)) revert InvalidRecipient();
        tokenId = nextTokenId++;
        _safeMint(to, tokenId);
    }
}
