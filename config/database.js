const { Sequelize } = require("sequelize");
require("dotenv").config();

// Membuat koneksi database menggunakan Sequelize
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
  host: process.env.DB_HOST,
  dialect: "mysql",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

// Fungsi untuk memastikan koneksi ke database
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log("Koneksi ke database berhasil.");
  } catch (error) {
    console.error("Gagal terkoneksi ke database:", error);
  }
};

module.exports = { sequelize, testConnection };
