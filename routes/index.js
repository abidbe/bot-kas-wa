const express = require("express");
const router = express.Router();
const path = require("path");

// Route untuk halaman utama
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/register.html"));
});

// Export router
module.exports = router;
