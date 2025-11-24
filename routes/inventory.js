const router = require("express").Router();
const { protectuser } = require("../middleware/middleware");
const { 
    getMyInventory,
    getInventoryItem,
    getInventoryByType,
    useItem,
    equipItem,
    unequipItem,
    getEquippedItems,
    getInventoryStats,
    mintItem,
    listItem
} = require("../controllers/inventory");

router
    // Get player's inventory (in-game items only by default)
    .get("/my-items", protectuser, getMyInventory)
    
    // Get specific inventory item
    .get("/item/:inventoryId", protectuser, getInventoryItem)
    
    // Get items by type (energy, potion, title)
    .get("/by-type/:type", protectuser, getInventoryByType)
    
    // Get equipped items
    .get("/equipped", protectuser, getEquippedItems)
    
    // Get inventory statistics
    .get("/stats", protectuser, getInventoryStats)
    
    // Use/consume an item
    .post("/use-item", protectuser, useItem)
    
    // Equip an item (titles, skins, etc.)
    .post("/equip-item", protectuser, equipItem)
    
    // Unequip an item
    .post("/unequip-item", protectuser, unequipItem)
    
    // Mint one or more copies of an in-game item into NFTs (creates minted inventory records)
    .post("/mint-item", protectuser, mintItem)
    
    // List an item on the marketplace
    .post("/list-item", protectuser, listItem)

module.exports = router;
