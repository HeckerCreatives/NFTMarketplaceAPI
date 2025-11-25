const { authlogin, register, logout, checkSession, getUserList } = require("../controllers/auth");
const { requestNonce, walletLogin, linkWallet, unlinkWallet } = require("../controllers/walletAuth");

const router = require("express").Router()
const { protectuser } = require("../middleware/middleware")

router
    .get("/login", authlogin)
    .post("/register", register)
    .post("/logout", logout)
    .get("/session", checkSession)
    // Get user list (authenticated users only, excludes self)
    .get("/users", protectuser, getUserList)
    // Wallet authentication routes
    .post("/wallet/request-nonce", requestNonce)
    .post("/wallet/login", walletLogin)
    .post("/wallet/link", linkWallet)
    .post("/wallet/unlink", unlinkWallet)
    
module.exports = router;
