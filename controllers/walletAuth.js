const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { ethers } = require('ethers');
const jsonwebtokenPromisified = require('jsonwebtoken-promisified');
const path = require("path");

const privateKey = fs.readFileSync(path.resolve(__dirname, "../keys/private-key.pem"), 'utf-8');
const Users = require('../models/Users');
const Userdetails = require('../models/Userdetails');
const { grantItems } = require('../initialization/grantItems');

const encrypt = async password => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
}

// Generate a random nonce for wallet signature
const generateNonce = () => {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * POST /auth/wallet/request-nonce
 * Request a nonce for wallet signature
 */
exports.requestNonce = async (req, res) => {
    try {
        const { walletAddress } = req.body;

        if (!walletAddress) {
            return res.status(400).json({ 
                message: "bad-request", 
                data: "Wallet address is required!" 
            });
        }

        // Normalize wallet address to lowercase
        const normalizedAddress = walletAddress.toLowerCase();

        // Generate nonce with 5-minute expiry
        const nonce = generateNonce();
        const nonceExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Find or create user with this wallet
        let user = await Users.findOne({ walletAddress: normalizedAddress });
        
        if (!user) {
            // Create temporary user entry just to store nonce
            user = await Users.create({
                walletAddress: normalizedAddress,
                walletNonce: nonce,
                walletNonceExpiry: nonceExpiry,
                status: "pending" // Mark as pending until first login
            });
        } else {
            // Update existing user's nonce
            user.walletNonce = nonce;
            user.walletNonceExpiry = nonceExpiry;
            await user.save();
        }

        return res.json({
            message: "success",
            data: {
                nonce,
                message: `Sign this message to authenticate with your wallet:\n\nNonce: ${nonce}\nWallet: ${normalizedAddress}`
            }
        });

    } catch (err) {
        console.error('Request nonce error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to generate nonce. Please try again." 
        });
    }
}

/**
 * POST /auth/wallet/login
 * Login or auto-register with wallet signature
 */
exports.walletLogin = async (req, res) => {
    try {
        const { walletAddress, signature } = req.body;

        if (!walletAddress || !signature) {
            return res.status(400).json({ 
                message: "bad-request", 
                data: "Wallet address and signature are required!" 
            });
        }

        const normalizedAddress = walletAddress.toLowerCase();

        // Find user by wallet address
        const user = await Users.findOne({ walletAddress: normalizedAddress });

        if (!user || !user.walletNonce || !user.walletNonceExpiry) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Please request a nonce first!" 
            });
        }

        // Check if nonce has expired
        if (new Date() > user.walletNonceExpiry) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Nonce has expired. Please request a new one!" 
            });
        }

        // Verify signature
        const message = `Sign this message to authenticate with your wallet:\n\nNonce: ${user.walletNonce}\nWallet: ${normalizedAddress}`;
        
        try {
            const recoveredAddress = ethers.utils.verifyMessage(message, signature);
            
            if (recoveredAddress.toLowerCase() !== normalizedAddress) {
                return res.status(401).json({ 
                    message: "failed", 
                    data: "Invalid signature!" 
                });
            }
        } catch (verifyError) {
            console.error('Signature verification error:', verifyError);
            return res.status(401).json({ 
                message: "failed", 
                data: "Invalid signature format!" 
            });
        }

        // Clear nonce after successful verification
        user.walletNonce = null;
        user.walletNonceExpiry = null;

        // Auto-register: Complete user profile if this is first login
        if (user.status === "pending") {
            // Generate unique username from wallet address
            const shortAddress = walletAddress.substring(0, 10);
            let username = `wallet_${shortAddress}`;
            
            // Check for username uniqueness
            let counter = 1;
            while (await Users.findOne({ username })) {
                username = `wallet_${shortAddress}_${counter}`;
                counter++;
            }

            user.username = username;
            user.status = "active";
            user.webtoken = "";
            await user.save();

            // Create user details
            await Userdetails.create({
                owner: user._id,
                firstname: "Wallet",
                lastname: "User",
                profilepicture: ""
            });

            // Grant starter items to new wallet users
            try {
                await grantItems(user._id.toString(), [
                    { itemid: "ENG-001", quantity: 3 },   // 3x Energy Potion
                    { itemid: "XPPOT-001", quantity: 2 }  // 2x XP Booster
                ], {
                    isMintable: true,
                    reason: "welcome_bonus_wallet_signup"
                });
                console.log(`✓ Starter items granted to new wallet user: ${user.username}`);
            } catch (grantError) {
                console.error(`✗ Failed to grant starter items to ${user.username}:`, grantError);
                // Don't fail the login if granting items fails; log the error but let user proceed
            }
        }

        // Check account status
        if (user.status !== "active") {
            return res.status(401).json({ 
                message: 'failed', 
                data: `Your account has been ${user.status}! Please contact support for more details.` 
            });
        }

        // Generate web token
        const token = await encrypt(privateKey);
        user.webtoken = token;
        await user.save();

        // Create JWT payload
        const payload = { 
            id: user._id, 
            username: user.username, 
            walletAddress: user.walletAddress,
            status: user.status, 
            token: token, 
            auth: "user" 
        };

        let jwtoken = "";
        try {
            jwtoken = await jsonwebtokenPromisified.sign(payload, privateKey, { algorithm: 'RS256' });
        } catch (error) {
            console.error('Error signing token:', error.message);
            return res.status(500).json({ 
                error: 'Internal Server Error', 
                data: "There's a problem signing in! Please contact customer support. Error 004" 
            });
        }

        res.cookie('sessionToken', jwtoken, { secure: true, sameSite: 'None' });
        return res.json({
            message: "success", 
            data: {
                auth: "user",
                isNewUser: user.createdAt.getTime() === user.updatedAt.getTime()
            }
        });

    } catch (err) {
        console.error('Wallet login error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Login failed. Please try again." 
        });
    }
}

/**
 * POST /auth/wallet/link
 * Link wallet to existing authenticated account
 */
exports.linkWallet = async (req, res) => {
    try {
        // Get token from cookie
        const token = req.headers.cookie?.split('; ').find(row => row.startsWith('sessionToken='))?.split('=')[1];

        if (!token) {
            return res.status(401).json({ 
                message: 'Unauthorized', 
                data: "You must be logged in to link a wallet!" 
            });
        }

        // Verify JWT
        const fs = require('fs');
        const publicKey = fs.readFileSync(path.resolve(__dirname, "../keys/public-key.pem"), 'utf-8');
        
        let decodedToken;
        try {
            decodedToken = await jsonwebtokenPromisified.verify(token, publicKey, { algorithms: ['RS256'] });
        } catch (error) {
            return res.status(401).json({ 
                message: 'Unauthorized', 
                data: "Invalid session!" 
            });
        }

        const { walletAddress, signature } = req.body;

        if (!walletAddress || !signature) {
            return res.status(400).json({ 
                message: "bad-request", 
                data: "Wallet address and signature are required!" 
            });
        }

        const normalizedAddress = walletAddress.toLowerCase();

        // Check if wallet is already linked to another account
        const existingWallet = await Users.findOne({ 
            walletAddress: normalizedAddress,
            _id: { $ne: decodedToken.id }
        });

        if (existingWallet) {
            return res.status(400).json({ 
                message: "failed", 
                data: "This wallet is already linked to another account!" 
            });
        }

        // Find current user
        const user = await Users.findById(decodedToken.id);

        if (!user) {
            return res.status(404).json({ 
                message: "failed", 
                data: "User not found!" 
            });
        }

        if (user.walletAddress) {
            return res.status(400).json({ 
                message: "failed", 
                data: "An wallet is already linked to this account. Unlink it first!" 
            });
        }

        // Get nonce from temporary wallet record
        const tempWallet = await Users.findOne({ walletAddress: normalizedAddress });

        if (!tempWallet || !tempWallet.walletNonce || !tempWallet.walletNonceExpiry) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Please request a nonce first!" 
            });
        }

        // Check if nonce has expired
        if (new Date() > tempWallet.walletNonceExpiry) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Nonce has expired. Please request a new one!" 
            });
        }

        // Verify signature
        const message = `Sign this message to authenticate with your wallet:\n\nNonce: ${tempWallet.walletNonce}\nWallet: ${normalizedAddress}`;
        
        try {
            const recoveredAddress = ethers.utils.verifyMessage(message, signature);
            
            if (recoveredAddress.toLowerCase() !== normalizedAddress) {
                return res.status(401).json({ 
                    message: "failed", 
                    data: "Invalid signature!" 
                });
            }
        } catch (verifyError) {
            console.error('Signature verification error:', verifyError);
            return res.status(401).json({ 
                message: "failed", 
                data: "Invalid signature format!" 
            });
        }

        // Delete temporary wallet record
        await Users.findByIdAndDelete(tempWallet._id);

        // Link wallet to current user
        user.walletAddress = normalizedAddress;
        await user.save();

        return res.json({
            message: "success",
            data: "Wallet successfully linked to your account!"
        });

    } catch (err) {
        console.error('Link wallet error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to link wallet. Please try again." 
        });
    }
}

/**
 * POST /auth/wallet/unlink
 * Remove wallet from authenticated account
 */
exports.unlinkWallet = async (req, res) => {
    try {
        // Get token from cookie
        const token = req.headers.cookie?.split('; ').find(row => row.startsWith('sessionToken='))?.split('=')[1];

        if (!token) {
            return res.status(401).json({ 
                message: 'Unauthorized', 
                data: "You must be logged in to unlink a wallet!" 
            });
        }

        // Verify JWT
        const fs = require('fs');
        const publicKey = fs.readFileSync(path.resolve(__dirname, "../keys/public-key.pem"), 'utf-8');
        
        let decodedToken;
        try {
            decodedToken = await jsonwebtokenPromisified.verify(token, publicKey, { algorithms: ['RS256'] });
        } catch (error) {
            return res.status(401).json({ 
                message: 'Unauthorized', 
                data: "Invalid session!" 
            });
        }

        // Find current user
        const user = await Users.findById(decodedToken.id);

        if (!user) {
            return res.status(404).json({ 
                message: "failed", 
                data: "User not found!" 
            });
        }

        if (!user.walletAddress) {
            return res.status(400).json({ 
                message: "failed", 
                data: "No wallet is linked to this account!" 
            });
        }

        // Check if user has a password (to prevent account lockout)
        if (!user.password) {
            return res.status(400).json({ 
                message: "failed", 
                data: "Cannot unlink wallet: Please set a password first to avoid losing access to your account!" 
            });
        }

        // Unlink wallet
        user.walletAddress = null;
        user.walletNonce = null;
        user.walletNonceExpiry = null;
        await user.save();

        return res.json({
            message: "success",
            data: "Wallet successfully unlinked from your account!"
        });

    } catch (err) {
        console.error('Unlink wallet error:', err);
        return res.status(500).json({ 
            message: "error", 
            data: "Failed to unlink wallet. Please try again." 
        });
    }
}
