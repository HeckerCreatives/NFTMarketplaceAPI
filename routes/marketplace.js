const router = require("express").Router();
const { protectuser } = require("../middleware/middleware");
const { 
    listNFT,
    cancelListing,
    buyNFT,
    getListings,
    getMyListings,
    getListingByToken
} = require("../controllers/nftMarketplace");

router
    // Get all active listings (public)
    .get("/listings", protectuser, getListings)
    
    // Get specific listing by tokenId (public)
    .get("/listing/:tokenId", protectuser, getListingByToken)

// Protected routes require authentication

router
    // List NFT for sale
    .post("/list-nft", protectuser, listNFT)
    
    // Cancel NFT listing
    .post("/cancel-listing", protectuser, cancelListing)
    
    // Record NFT purchase
    .post("/buy-nft", protectuser, buyNFT)
    
    // Get user's active listings
    .get("/my-listings", protectuser, getMyListings)

module.exports = router;
