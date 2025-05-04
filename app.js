const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");
const { sequelize, syncModels } = require("./models/index");
const { testConnection } = require("./config/database");
const { initializeBot } = require("./whatsapp/bot");
require("dotenv").config();

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/", require("./routes/index"));
app.use("/api", require("./routes/api"));

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await testConnection();

    // Sync database models
    await syncModels();

    // Initialize WhatsApp bot
    console.log("Menginisialisasi WhatsApp Bot...");
    initializeBot();

    // Tidak perlu menunggu bot siap sebelum memulai server
    // Start server
    app.listen(PORT, () => {
      console.log(`Server berjalan di port ${PORT}`);
    });
  } catch (error) {
    console.error("Gagal menjalankan server:", error);
    process.exit(1);
  }
};

// Start the server
startServer();

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully");

  // Close database connection
  await sequelize.close();

  process.exit(0);
});
