const { authlogin, register, logout, checkSession } = require("../controllers/auth");
const { requestNonce, walletLogin, linkWallet, unlinkWallet } = require("../controllers/walletAuth");

const router = require("express").Router()
// const { protectsuperadmin } = require("../middleware/middleware")

router
    .get("/login", authlogin)
    .post("/register", register)
    .post("/logout", logout)
    .get("/session", checkSession)
    // Wallet authentication routes
    .post("/wallet/request-nonce", requestNonce)
    .post("/wallet/login", walletLogin)
    .post("/wallet/link", linkWallet)
    .post("/wallet/unlink", unlinkWallet)
    
module.exports = router;
