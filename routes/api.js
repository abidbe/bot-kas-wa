const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");

// Route untuk mendaftarkan pengguna baru
router.post("/register", userController.registerUser);

// Export router
module.exports = router;
