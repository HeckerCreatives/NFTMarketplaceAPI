const { ethers } = require('ethers');
const Inventory = require('../models/Inventory');
const Marketplace = require('../models/Marketplace');

/**
 * GET /nft/mintable-items
 * Get all items that can be minted as NFTs from user's inventory
 */
exports.getMintableItems = async (req, res) => {
    try {
        const user = req.user;

        // Get user's inventory items that are mintable but not yet minted
        const mintableItems = await Inventory.find({
            owner: user._id,
            isMintable: true,
            isMinted: false
        }).populate('item', 'itemname description ipfsImage nftMetadata rarity tokenStandard');

        return res.json({
            message: "success",
            data: mintableItems
        });

    } catch (err) {
        console.error('Get mintable items error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to retrieve mintable items." 
        });
    }
};

/**
 * GET /nft/minted-items
 * Get all NFTs that user has minted
 */
exports.getMintedItems = async (req, res) => {
    try {
        const user = req.user;

        // Get user's minted NFTs
        const mintedItems = await Inventory.find({
            owner: user._id,
            isMinted: true
        }).populate('item', 'itemname description ipfsImage nftMetadata rarity');

        return res.json({
            message: "success",
            data: mintedItems
        });

    } catch (err) {
        console.error('Get minted items error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to retrieve minted items." 
        });
    }
};

/**
 * POST /nft/prepare-mint
 * Prepare item for minting - validate and return metadata
 * Works with MyNFT contract (ERC721)
 */
exports.prepareMint = async (req, res) => {
    try {
        const user = req.user;
        const { inventoryId } = req.body;

        if (!inventoryId) {
            return res.status(400).json({ 
                message: "bad-request", 
                data: "Inventory ID is required!" 
            });
        }

        // Verify user has wallet connected
        if (!user.walletAddress) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Please connect your wallet before minting!" 
            });
        }

        // Get inventory item
        const inventoryItem = await Inventory.findOne({
            _id: inventoryId,
            owner: user._id
        }).populate('item');

        if (!inventoryItem) {
            return res.status(404).json({ 
                message: "failed", 
                data: "Item not found in your inventory!" 
            });
        }

        // Check if item is mintable
        if (!inventoryItem.isMintable) {
            return res.status(400).json({ 
                message: "failed", 
                data: "This item cannot be minted as NFT!" 
            });
        }

        // Check if already minted
        if (inventoryItem.isMinted) {
            return res.status(400).json({ 
                message: "failed", 
                data: "This item has already been minted!" 
            });
        }

        // Check supply limit if applicable
        const marketplaceItem = inventoryItem.item;
        if (marketplaceItem && marketplaceItem.maxSupply) {
            if (marketplaceItem.currentSupply >= marketplaceItem.maxSupply) {
                return res.status(400).json({ 
                    message: "failed", 
                    data: "Maximum supply reached for this item!" 
                });
            }
        }

        // Prepare NFT metadata (for off-chain storage)
        const metadata = {
            name: marketplaceItem?.nftMetadata?.name || inventoryItem.itemname,
            description: marketplaceItem?.nftMetadata?.description || marketplaceItem?.description || inventoryItem.itemname,
            image: marketplaceItem?.nftMetadata?.image || inventoryItem.ipfsImage,
            external_url: marketplaceItem?.nftMetadata?.external_url || "",
            attributes: marketplaceItem?.nftMetadata?.attributes || [
                { trait_type: "Type", value: inventoryItem.type },
                { trait_type: "Item ID", value: inventoryItem.itemid },
                { trait_type: "Rarity", value: marketplaceItem?.rarity || "common" },
                { trait_type: "Quantity", value: inventoryItem.quantity }
            ]
        };

        return res.json({
            message: "success",
            data: {
                inventoryId: inventoryItem._id,
                metadata,
                tokenStandard: 'ERC721',
                walletAddress: user.walletAddress,
                nftContractAddress: marketplaceItem?.nftContractAddress || process.env.NFT_CONTRACT_ADDRESS || null,
                marketplaceContractAddress: marketplaceItem?.marketplaceContractAddress || process.env.MARKETPLACE_CONTRACT_ADDRESS || null
            }
        });

    } catch (err) {
        console.error('Prepare mint error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to prepare minting." 
        });
    }
};

/**
 * POST /nft/confirm-mint
 * Confirm successful minting and update database
 * For MyNFT contract (ERC721) - owner mints via mintNFT()
 */
exports.confirmMint = async (req, res) => {
    try {
        const user = req.user;
        const { 
            inventoryId, 
            tokenId, 
            nftContractAddress,
            marketplaceContractAddress,
            transactionHash,
            chainId,
            metadataUri
        } = req.body;

        if (!inventoryId || !tokenId || !nftContractAddress || !transactionHash) {
            return res.status(400).json({ 
                message: "bad-request", 
                data: "Missing required minting data (inventoryId, tokenId, nftContractAddress, transactionHash)!" 
            });
        }

        // Verify user has wallet
        if (!user.walletAddress) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Wallet address not found!" 
            });
        }

        // Get inventory item
        const inventoryItem = await Inventory.findOne({
            _id: inventoryId,
            owner: user._id
        }).populate('item');

        if (!inventoryItem) {
            return res.status(404).json({ 
                message: "failed", 
                data: "Item not found!" 
            });
        }

        if (inventoryItem.isMinted) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Item already minted!" 
            });
        }

        // Update inventory with NFT data
        inventoryItem.isMinted = true;
        inventoryItem.nftData = {
            tokenId: tokenId.toString(),
            nftContractAddress,
            marketplaceContractAddress: marketplaceContractAddress || null,
            tokenStandard: 'ERC721',
            chainId: chainId || 1,
            mintTransactionHash: transactionHash,
            mintedAt: new Date(),
            metadataUri: metadataUri || ""
        };

        // Add initial transfer history
        inventoryItem.transferHistory = [{
            from: "system",
            to: user.walletAddress,
            txHash: transactionHash,
            action: "mint",
            timestamp: new Date()
        }];

        await inventoryItem.save();

        // Update marketplace item supply
        if (inventoryItem.item) {
            await Marketplace.findByIdAndUpdate(
                inventoryItem.item._id,
                { $inc: { currentSupply: 1 } }
            );
        }

        return res.json({
            message: "success",
            data: {
                message: "Item successfully minted as NFT!",
                nftData: inventoryItem.nftData,
                tokenId: tokenId.toString()
            }
        });

    } catch (err) {
        console.error('Confirm mint error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to confirm minting." 
        });
    }
};

/**
 * POST /nft/burn
 * Burn/redeem NFT back to in-game item
 */
exports.burnNFT = async (req, res) => {
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

        if (!inventoryItem.isMinted) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Item is not minted!" 
            });
        }

        // Store burn history
        const burnData = {
            ...inventoryItem.nftData.toObject(),
            burnedAt: new Date(),
            burnTransactionHash: transactionHash
        };

        // Reset NFT status
        inventoryItem.isMinted = false;
        inventoryItem.nftData = undefined;
        
        // Add burn to transfer history
        inventoryItem.transferHistory.push({
            from: user.walletAddress,
            to: "burned",
            txHash: transactionHash,
            timestamp: new Date()
        });

        await inventoryItem.save();

        // Decrease marketplace supply
        if (inventoryItem.item) {
            await Marketplace.findByIdAndUpdate(
                inventoryItem.item,
                { $inc: { currentSupply: -1 } }
            );
        }

        return res.json({
            message: "success",
            data: {
                message: "NFT successfully burned and redeemed!",
                burnData
            }
        });

    } catch (err) {
        console.error('Burn NFT error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to burn NFT." 
        });
    }
};

/**
 * GET /nft/item/:inventoryId
 * Get detailed NFT information
 */
exports.getNFTDetails = async (req, res) => {
    try {
        const user = req.user;
        const { inventoryId } = req.params;

        const inventoryItem = await Inventory.findOne({
            _id: inventoryId,
            owner: user._id
        }).populate('item');

        if (!inventoryItem) {
            return res.status(404).json({ 
                message: "failed", 
                data: "Item not found!" 
            });
        }

        return res.json({
            message: "success",
            data: {
                inventory: inventoryItem,
                marketplace: inventoryItem.item
            }
        });

    } catch (err) {
        console.error('Get NFT details error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to get NFT details." 
        });
    }
};

/**
 * POST /nft/update-transfer
 * Update transfer history when NFT is transferred on blockchain
 */
exports.updateTransfer = async (req, res) => {
    try {
        const user = req.user;

        if (!inventoryId || !fromAddress || !toAddress || !transactionHash) {
            return res.status(400).json({ 
                message: "bad-request", 
                data: "Missing transfer data!" 
            });
        }

        const inventoryItem = await Inventory.findById(inventoryId);

        if (!inventoryItem) {
            return res.status(404).json({ 
                message: "failed", 
                data: "Item not found!" 
            });
        }

        if (!inventoryItem.isMinted) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Item is not minted!" 
            });
        }

        // Add transfer to history
        inventoryItem.transferHistory.push({
            from: fromAddress.toLowerCase(),
            to: toAddress.toLowerCase(),
            txHash: transactionHash,
            timestamp: new Date()
        });

        // If transferred to different wallet, update owner
        const newOwner = await Users.findOne({ 
            walletAddress: toAddress.toLowerCase() 
        });

        if (newOwner && newOwner._id.toString() !== inventoryItem.owner.toString()) {
            inventoryItem.owner = newOwner._id;
        }

        await inventoryItem.save();

        return res.json({
            message: "success",
            data: "Transfer recorded successfully!"
        });

    } catch (err) {
        console.error('Update transfer error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to update transfer." 
        });
    }
};
