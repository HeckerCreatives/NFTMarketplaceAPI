const router = require("express").Router();
const { protectuser } = require("../middleware/middleware");
const { 
    getMintableItems, 
    getMintedItems, 
    prepareMint, 
    confirmMint, 
    burnNFT,
    getNFTDetails,
    updateTransfer
} = require("../controllers/nftMinting");


router
    // Get items available for minting
    .get("/mintable-items", protectuser, getMintableItems)
    
    // Get already minted NFTs
    .get("/minted-items", protectuser, getMintedItems)
    
    // Get specific NFT details
    .get("/item/:inventoryId", protectuser, getNFTDetails)
    
    // Prepare item for minting (validate and get metadata)
    .post("/prepare-mint", protectuser, prepareMint)
    
    // Confirm successful mint on blockchain
    .post("/confirm-mint", protectuser, confirmMint)
    
    // Burn/redeem NFT back to in-game item
    .post("/burn", protectuser, burnNFT)
    
    // Update transfer history
    .post("/update-transfer", protectuser, updateTransfer)

module.exports = router;
