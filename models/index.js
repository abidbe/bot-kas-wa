const { sequelize } = require("../config/database");
const User = require("./user");
const Transaction = require("./transaction");
const Category = require("./category");

// Definisikan relasi antar model
User.hasMany(Transaction, {
  foreignKey: "userId",
  onDelete: "CASCADE",
});
Transaction.belongsTo(User, {
  foreignKey: "userId",
});

Category.hasMany(Transaction, {
  foreignKey: "categoryId",
});
Transaction.belongsTo(Category, {
  foreignKey: "categoryId",
});

// Fungsi untuk menyinkronkan semua model dengan database
const syncModels = async () => {
  try {
    // Hapus bagian sync otomatis seluruh model
    // await sequelize.sync({ force: process.env.NODE_ENV === "development" });

    // Sesuaikan urutan sinkronisasi manual satu per satu
    await User.sync({ force: process.env.NODE_ENV === "development" });
    await Category.sync({ force: process.env.NODE_ENV === "development" });
    // Buat transaksi terakhir karena memiliki foreign key ke kedua tabel diatas
    await Transaction.sync({ force: process.env.NODE_ENV === "development" });

    console.log("Database & tabel berhasil disinkronkan");

    // Buat kategori default jika tidak ada (kode ini tidak perlu diubah)
    const categories = await Category.findAll();
    if (categories.length === 0) {
      await Category.bulkCreate([
        // kategori-kategori yang sudah ada
      ]);
      console.log("Kategori default berhasil dibuat");
    }
  } catch (error) {
    console.error("Gagal menyinkronkan database:", error);
  }
};

module.exports = {
  sequelize,
  User,
  Transaction,
  Category,
  syncModels,
};
