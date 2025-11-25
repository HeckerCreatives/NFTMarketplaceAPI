const Inventory = require('../models/Inventory');
const Marketplace = require('../models/Marketplace');

/**
 * GET /inventory/my-items
 * Get player's in-game inventory (not minted items only)
 */
exports.getMyInventory = async (req, res) => {
    try {
        const user = req.user;
        const { includeNFTs = false } = req.query; // Option to include minted items

        const filter = { owner: user._id, isListed: false };
        
        // By default, only show in-game items (not minted)
        if (includeNFTs === 'false' || !includeNFTs) {
            filter.isMinted = false;
        }

        const inventory = await Inventory.find(filter)
            .populate('item', 'itemname description amount currency type rarity canBeMintedAsNFT')
            .sort({ createdAt: -1 });

        return res.json({
            message: "success",
            data: {
                inventory,
                totalItems: inventory.length,
                summary: {
                    byType: await getSummaryByType(user._id),
                    totalQuantity: inventory.reduce((sum, item) => sum + item.quantity, 0)
                }
            }
        });

    } catch (err) {
        console.error('Get inventory error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to retrieve inventory." 
        });
    }
};

/**
 * GET /inventory/item/:inventoryId
 * Get specific inventory item details
 */
exports.getInventoryItem = async (req, res) => {
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
                data: "Item not found in your inventory!" 
            });
        }

        return res.json({
            message: "success",
            data: inventoryItem
        });

    } catch (err) {
        console.error('Get inventory item error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to retrieve item." 
        });
    }
};

/**
 * GET /inventory/by-type/:type
 * Get inventory items by type (energy, potion, title)
 */
exports.getInventoryByType = async (req, res) => {
    try {
        const user = req.user;
        const { type } = req.params;

        const inventory = await Inventory.find({
            owner: user._id,
            type: type.toLowerCase(),
            isMinted: false, // Only in-game items
            isListed: false // Exclude listed items
        }).populate('item');

        return res.json({
            message: "success",
            data: {
                type,
                items: inventory,
                totalQuantity: inventory.reduce((sum, item) => sum + item.quantity, 0)
            }
        });

    } catch (err) {
        console.error('Get inventory by type error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to retrieve items by type." 
        });
    }
};

/**
 * POST /inventory/use-item
 * Use/consume an in-game item
 */
exports.useItem = async (req, res) => {
    try {
        const user = req.user;
        const { inventoryId, quantity = 1 } = req.body;

        if (!inventoryId) {
            return res.status(400).json({ 
                message: "bad-request", 
                data: "Inventory ID is required!" 
            });
        }

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

        // Check if item is listed on marketplace
        if (inventoryItem.isListed) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Cannot use items that are listed on the marketplace!" 
            });
        }

        // Check if item is minted (can't use minted NFTs in-game)
        if (inventoryItem.isMinted) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Cannot use minted NFTs! Burn it first to use in-game." 
            });
        }

        // Check if item is consumable
        if (!inventoryItem.item?.consumable || inventoryItem.item.consumable === "0") {
            return res.status(400).json({ 
                message: "failed", 
                data: "This item is not consumable!" 
            });
        }

        // Check quantity
        if (inventoryItem.quantity < quantity) {
            return res.status(400).json({ 
                message: "failed", 
                data: `Not enough quantity! You have ${inventoryItem.quantity}, requested ${quantity}.` 
            });
        }

        // Reduce quantity
        inventoryItem.quantity -= quantity;

        if (inventoryItem.quantity <= 0) {
            await Inventory.findByIdAndDelete(inventoryItem._id);
        } else {
            await inventoryItem.save();
        }

        return res.json({
            message: "success",
            data: {
                message: `Used ${quantity}x ${inventoryItem.itemname}`,
                itemUsed: {
                    itemid: inventoryItem.itemid,
                    itemname: inventoryItem.itemname,
                    quantityUsed: quantity,
                    remainingQuantity: Math.max(0, inventoryItem.quantity)
                },
                effect: {
                    type: inventoryItem.type,
                    value: inventoryItem.item.consumable
                }
            }
        });

    } catch (err) {
        console.error('Use item error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to use item." 
        });
    }
};

/**
 * POST /inventory/equip-item
 * Equip an item (for titles, skins, etc.)
 */
exports.equipItem = async (req, res) => {
    try {
        const user = req.user;
        const { inventoryId } = req.body;

        if (!inventoryId) {
            return res.status(400).json({ 
                message: "bad-request", 
                data: "Inventory ID is required!" 
            });
        }

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

        // Check if item is listed on marketplace
        if (inventoryItem.isListed) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Cannot equip items that are listed on the marketplace!" 
            });
        }

        // Check if item is minted
        if (inventoryItem.isMinted) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Cannot equip minted NFTs! Burn it first to use in-game." 
            });
        }

        // Unequip other items of same type
        await Inventory.updateMany(
            { owner: user._id, type: inventoryItem.type, isEquipped: true },
            { isEquipped: false }
        );

        // Equip this item
        inventoryItem.isEquipped = true;
        await inventoryItem.save();

        return res.json({
            message: "success",
            data: {
                message: `Equipped ${inventoryItem.itemname}`,
                equippedItem: inventoryItem
            }
        });

    } catch (err) {
        console.error('Equip item error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to equip item." 
        });
    }
};

/**
 * POST /inventory/unequip-item
 * Unequip an item
 */
exports.unequipItem = async (req, res) => {
    try {
        const user = req.user;
        const { inventoryId } = req.body;

        if (!inventoryId) {
            return res.status(400).json({ 
                message: "bad-request", 
                data: "Inventory ID is required!" 
            });
        }

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

        inventoryItem.isEquipped = false;
        await inventoryItem.save();

        return res.json({
            message: "success",
            data: {
                message: `Unequipped ${inventoryItem.itemname}`,
                item: inventoryItem
            }
        });

    } catch (err) {
        console.error('Unequip item error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to unequip item." 
        });
    }
};

/**
 * GET /inventory/equipped
 * Get all equipped items
 */
exports.getEquippedItems = async (req, res) => {
    try {
        const user = req.user;

        const equippedItems = await Inventory.find({
            owner: user._id,
            isEquipped: true,
            isMinted: false,
            isListed: false
        }).populate('item');

        return res.json({
            message: "success",
            data: equippedItems
        });

    } catch (err) {
        console.error('Get equipped items error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to retrieve equipped items." 
        });
    }
};

/**
 * GET /inventory/stats
 * Get inventory statistics
 */
exports.getInventoryStats = async (req, res) => {
    try {
        const user = req.user;

        const [inGameItems, mintedItems, listedItems] = await Promise.all([
            Inventory.countDocuments({ owner: user._id, isMinted: false }),
            Inventory.countDocuments({ owner: user._id, isMinted: true }),
            Inventory.countDocuments({ owner: user._id, isListed: true })
        ]);

        const byType = await getSummaryByType(user._id);

        return res.json({
            message: "success",
            data: {
                totalItems: inGameItems + mintedItems,
                inGameItems,
                mintedNFTs: mintedItems,
                listedOnMarketplace: listedItems,
                byType
            }
        });

    } catch (err) {
        console.error('Get inventory stats error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to retrieve stats." 
        });
    }
};

/**
 * POST /inventory/mint-item
 * Mint one or more copies of an in-game item into one-or-more NFT inventory entries.
 * Does NOT perform on-chain minting; it reserves/creates minted inventory records
 * that the frontend / minting service can use to perform the actual blockchain mint,
 * then call the confirm-mint endpoint to attach tokenId and txHash.
 */
exports.mintItem = async (req, res) => {
    try {
        const user = req.user;
        const { inventoryId, quantity = 1, metadataUri, targetWallet } = req.body;

        if (!inventoryId) {
            return res.status(400).json({ message: "bad-request", data: "Inventory ID is required!" });
        }

        const qty = parseInt(quantity, 10) || 1;
        if (qty <= 0) {
            return res.status(400).json({ message: "bad-request", data: "Quantity must be a positive integer." });
        }

        const inventoryItem = await Inventory.findOne({ _id: inventoryId, owner: user._id }).populate('item');

        if (!inventoryItem) {
            return res.status(404).json({ message: "failed", data: "Item not found in your inventory!" });
        }

        if (!inventoryItem.isMintable) {
            return res.status(400).json({ message: "failed", data: "This item is not mintable." });
        }

        if (inventoryItem.isMinted) {
            return res.status(400).json({ message: "failed", data: "Item is already minted." });
        }

        if (inventoryItem.quantity < qty) {
            return res.status(400).json({ message: "failed", data: `Not enough quantity to mint. You have ${inventoryItem.quantity}, requested ${qty}.` });
        }

        // Use user's linked wallet if available, otherwise use provided targetWallet or leave unknown
        const ownerWallet = (user.walletAddress && user.walletAddress.toLowerCase()) || (targetWallet && String(targetWallet).toLowerCase()) || "unknown";

        const createdMinted = [];

        for (let i = 0; i < qty; i++) {
            const newItem = {
                owner: user._id,
                item: inventoryItem.item ? inventoryItem.item._id : undefined,
                itemid: inventoryItem.itemid,
                itemname: inventoryItem.itemname,
                type: inventoryItem.type,
                quantity: 1,
                isEquipped: false,
                ipfsImage: inventoryItem.ipfsImage || metadataUri || (inventoryItem.item && inventoryItem.item.ipfsImage) || null,
                isMintable: true,
                isMinted: true,
                nftData: {
                    tokenId: null,
                    nftContractAddress: process.env.NFT_CONTRACT_ADDRESS || null,
                    marketplaceContractAddress: process.env.MARKETPLACE_CONTRACT_ADDRESS || null,
                    tokenStandard: "ERC721",
                    chainId: process.env.DEFAULT_CHAIN_ID ? parseInt(process.env.DEFAULT_CHAIN_ID, 10) : null,
                    mintTransactionHash: null,
                    mintedAt: null,
                    metadataUri: metadataUri || inventoryItem.ipfsImage || (inventoryItem.item && inventoryItem.item.ipfsImage) || null
                },
                isListed: false,
                isTransferable: inventoryItem.isTransferable !== undefined ? inventoryItem.isTransferable : true,
                transferHistory: [{
                    from: "system",
                    to: ownerWallet,
                    txHash: null,
                    action: "reserved-for-mint",
                    timestamp: new Date()
                }]
            };

            const created = await Inventory.create(newItem);
            createdMinted.push(created);
        }

        // Decrement source item quantity or remove it
        inventoryItem.quantity -= qty;
        let remaining = inventoryItem.quantity;
        if (inventoryItem.quantity <= 0) {
            await Inventory.findByIdAndDelete(inventoryItem._id);
            remaining = 0;
        } else {
            await inventoryItem.save();
        }

        return res.json({
            message: "success",
            data: {
                mintedCount: createdMinted.length,
                mintedItems: createdMinted,
                remainingQuantity: remaining
            }
        });

    } catch (err) {
        console.error('Mint item error:', err);
        return res.status(500).json({ message: "error", data: "Failed to mint item." });
    }
};

/**
 * POST /inventory/list-item
 * List an item on the marketplace (marks as listed, cannot be used/equipped)
 */
exports.listItem = async (req, res) => {
    try {
        const user = req.user;
        const { inventoryId, price } = req.body;

        if (!inventoryId) {
            return res.status(400).json({ 
                message: "bad-request", 
                data: "Inventory ID is required!" 
            });
        }

        if (!price || price <= 0) {
            return res.status(400).json({ 
                message: "bad-request", 
                data: "Valid price is required!" 
            });
        }

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

        if (inventoryItem.isListed) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Item is already listed on the marketplace!" 
            });
        }

        if (!inventoryItem.isMinted) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Only minted NFTs can be listed on the marketplace!" 
            });
        }

        // Unequip item if it's equipped
        if (inventoryItem.isEquipped) {
            inventoryItem.isEquipped = false;
        }

        // Mark as listed
        inventoryItem.isListed = true;
        await inventoryItem.save();

        // Create marketplace listing
        const marketplaceListing = await Marketplace.create({
            seller: user._id,
            inventoryItem: inventoryItem._id,
            tokenId: inventoryItem.nftData?.tokenId,
            price: price,
            currency: 'ETH',
            status: 'active',
            listedAt: new Date()
        });

        return res.json({
            message: "success",
            data: {
                message: `Listed ${inventoryItem.itemname} on marketplace`,
                listing: marketplaceListing,
                inventoryItem: inventoryItem
            }
        });

    } catch (err) {
        console.error('List item error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to list item on marketplace." 
        });
    }
};

/**
 * POST /inventory/transfer-item
 * Transfer a minted NFT item to another user (updates ownership after blockchain transfer)
 */
exports.transferItem = async (req, res) => {
    try {
        const user = req.user;
        const { inventoryId, recipientWallet, txHash } = req.body;

        if (!inventoryId) {
            return res.status(400).json({ 
                message: "bad-request", 
                data: "Inventory ID is required!" 
            });
        }

        if (!recipientWallet || !recipientWallet.match(/^0x[0-9a-fA-F]{40}$/)) {
            return res.status(400).json({ 
                message: "bad-request", 
                data: "Valid recipient wallet address is required!" 
            });
        }

        if (!txHash) {
            return res.status(400).json({ 
                message: "bad-request", 
                data: "Transaction hash is required!" 
            });
        }

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

        if (!inventoryItem.isMinted) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Only minted NFTs can be transferred!" 
            });
        }

        if (inventoryItem.isListed) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Cannot transfer items that are listed on the marketplace! Unlist it first." 
            });
        }

        if (!inventoryItem.isTransferable) {
            return res.status(400).json({ 
                message: "failed", 
                data: "This item is not transferable!" 
            });
        }

        const Users = require('../models/Users');
        
        // Find recipient by wallet address
        const recipientUser = await Users.findOne({ 
            walletAddress: recipientWallet.toLowerCase() 
        });

        if (!recipientUser) {
            return res.status(404).json({ 
                message: "failed", 
                data: "Recipient wallet address not found in system! User must link their wallet first." 
            });
        }

        if (recipientUser._id.toString() === user._id.toString()) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Cannot transfer to yourself!" 
            });
        }

        // Update transfer history
        inventoryItem.transferHistory.push({
            from: user.walletAddress || "unknown",
            to: recipientWallet.toLowerCase(),
            txHash: txHash,
            action: "transfer",
            timestamp: new Date()
        });

        // Update owner
        const oldOwnerId = inventoryItem.owner;
        inventoryItem.owner = recipientUser._id;
        
        // Unequip if equipped
        if (inventoryItem.isEquipped) {
            inventoryItem.isEquipped = false;
        }

        await inventoryItem.save();

        return res.json({
            message: "success",
            data: {
                message: `Successfully transferred ${inventoryItem.itemname} to ${recipientUser.username}`,
                transfer: {
                    itemId: inventoryItem._id,
                    itemname: inventoryItem.itemname,
                    tokenId: inventoryItem.nftData?.tokenId,
                    from: {
                        userId: oldOwnerId,
                        username: user.username,
                        wallet: user.walletAddress
                    },
                    to: {
                        userId: recipientUser._id,
                        username: recipientUser.username,
                        wallet: recipientUser.walletAddress
                    },
                    txHash: txHash,
                    timestamp: new Date()
                }
            }
        });

    } catch (err) {
        console.error('Transfer item error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to transfer item." 
        });
    }
};

// Helper function
async function getSummaryByType(userId) {
    const summary = await Inventory.aggregate([
        { $match: { owner: userId, isMinted: false, isListed: false } },
        { 
            $group: { 
                _id: "$type", 
                count: { $sum: 1 },
                totalQuantity: { $sum: "$quantity" }
            } 
        }
    ]);

    return summary.reduce((acc, item) => {
        acc[item._id] = {
            count: item.count,
            totalQuantity: item.totalQuantity
        };
        return acc;
    }, {});
}
