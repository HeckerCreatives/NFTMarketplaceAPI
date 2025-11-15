const Users = require('../models/Users');
const Inventory = require('../models/Inventory');
const Marketplace = require('../models/Marketplace');

/**
 * POST /marketplace/list-nft
 * List minted NFT on the marketplace contract
 */
exports.listNFT = async (req, res) => {
    try {
        const user = req.user;
        const { inventoryId, price, transactionHash } = req.body;

        if (!inventoryId || !price || !transactionHash) {
            return res.status(400).json({ 
                message: "bad-request", 
                data: "Inventory ID, price, and transaction hash required!" 
            });
        }

        // Get inventory item
        const inventoryItem = await Inventory.findOne({
            _id: inventoryId,
            owner: user._id
        });

        if (!inventoryItem) {
            return res.status(404).json({ 
                message: "failed", 
                data: "Item not found!" 
            });
        }

        if (!inventoryItem.isMinted) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Item must be minted before listing!" 
            });
        }

        if (inventoryItem.isListed) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Item is already listed!" 
            });
        }

        // Update listing status
        inventoryItem.isListed = true;
        inventoryItem.listingData = {
            price: price.toString(),
            listedAt: new Date(),
            listTransactionHash: transactionHash,
            seller: user.walletAddress
        };

        // Add to transfer history
        inventoryItem.transferHistory.push({
            from: user.walletAddress,
            to: "marketplace",
            txHash: transactionHash,
            action: "list",
            timestamp: new Date()
        });

        await inventoryItem.save();

        return res.json({
            message: "success",
            data: {
                message: "NFT successfully listed on marketplace!",
                listingData: inventoryItem.listingData
            }
        });

    } catch (err) {
        console.error('List NFT error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to list NFT." 
        });
    }
};

/**
 * POST /marketplace/cancel-listing
 * Cancel NFT listing on marketplace
 */
exports.cancelListing = async (req, res) => {
    try {
        const user = req.user;
        const { inventoryId, transactionHash } = req.body;

        if (!inventoryId || !transactionHash) {
            return res.status(400).json({ 
                message: "bad-request", 
                data: "Inventory ID and transaction hash required!" 
            });
        }

        // Get inventory item
        const inventoryItem = await Inventory.findOne({
            _id: inventoryId,
            owner: user._id
        });

        if (!inventoryItem) {
            return res.status(404).json({ 
                message: "failed", 
                data: "Item not found!" 
            });
        }

        if (!inventoryItem.isListed) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Item is not listed!" 
            });
        }

        // Update listing status
        inventoryItem.isListed = false;
        const previousListing = inventoryItem.listingData;
        inventoryItem.listingData = undefined;

        // Add to transfer history
        inventoryItem.transferHistory.push({
            from: "marketplace",
            to: user.walletAddress,
            txHash: transactionHash,
            action: "cancel",
            timestamp: new Date()
        });

        await inventoryItem.save();

        return res.json({
            message: "success",
            data: {
                message: "NFT listing cancelled successfully!",
                previousListing
            }
        });

    } catch (err) {
        console.error('Cancel listing error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to cancel listing." 
        });
    }
};

/**
 * POST /marketplace/buy-nft
 * Record NFT purchase from marketplace
 */
exports.buyNFT = async (req, res) => {
    try {
        const user = req.user;
        const { tokenId, sellerAddress, buyerAddress, transactionHash, price } = req.body;

        if (!tokenId || !sellerAddress || !buyerAddress || !transactionHash) {
            return res.status(400).json({ 
                message: "bad-request", 
                data: "Missing required purchase data!" 
            });
        }

        // Find the inventory item by tokenId and seller
        const inventoryItem = await Inventory.findOne({
            'nftData.tokenId': tokenId.toString(),
            isListed: true
        });

        if (!inventoryItem) {
            return res.status(404).json({ 
                message: "failed", 
                data: "Listed item not found!" 
            });
        }

        // Find or create buyer's user account
        let buyer = await Users.findOne({ walletAddress: buyerAddress.toLowerCase() });
        
        if (!buyer) {
            return res.status(404).json({ 
                message: "failed", 
                data: "Buyer must have an account! Please register first." 
            });
        }

        // Update listing status
        inventoryItem.isListed = false;
        inventoryItem.listingData = undefined;

        // Transfer ownership
        inventoryItem.owner = buyer._id;

        // Add to transfer history
        inventoryItem.transferHistory.push({
            from: sellerAddress.toLowerCase(),
            to: buyerAddress.toLowerCase(),
            txHash: transactionHash,
            action: "buy",
            timestamp: new Date()
        });

        await inventoryItem.save();

        return res.json({
            message: "success",
            data: {
                message: "NFT purchase recorded successfully!",
                newOwner: buyer._id,
                tokenId
            }
        });

    } catch (err) {
        console.error('Buy NFT error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to record purchase." 
        });
    }
};

/**
 * GET /marketplace/listings
 * Get all active NFT listings
 */
exports.getListings = async (req, res) => {
    try {
        const listings = await Inventory.find({
            isListed: true,
            isMinted: true
        })
        .populate('owner', 'username walletAddress')
        .populate('item', 'itemname description ipfsImage rarity nftMetadata');

        return res.json({
            message: "success",
            data: listings
        });

    } catch (err) {
        console.error('Get listings error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to get listings." 
        });
    }
};

/**
 * GET /marketplace/my-listings
 * Get current user's active listings
 */
exports.getMyListings = async (req, res) => {
    try {
        const user = req.user;

        const listings = await Inventory.find({
            owner: user._id,
            isListed: true,
            isMinted: true
        }).populate('item', 'itemname description ipfsImage rarity nftMetadata');

        return res.json({
            message: "success",
            data: listings
        });

    } catch (err) {
        console.error('Get my listings error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to get your listings." 
        });
    }
};

/**
 * GET /marketplace/listing/:tokenId
 * Get specific listing details by tokenId
 */
exports.getListingByToken = async (req, res) => {
    try {
        const { tokenId } = req.params;

        const listing = await Inventory.findOne({
            'nftData.tokenId': tokenId.toString(),
            isListed: true
        })
        .populate('owner', 'username walletAddress')
        .populate('item', 'itemname description ipfsImage rarity nftMetadata');

        if (!listing) {
            return res.status(404).json({ 
                message: "failed", 
                data: "Listing not found!" 
            });
        }

        return res.json({
            message: "success",
            data: listing
        });

    } catch (err) {
        console.error('Get listing error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to get listing." 
        });
    }
};
