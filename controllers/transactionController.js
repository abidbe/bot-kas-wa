const { Transaction, Category, User, sequelize } = require("../models/index");
const { Op } = require("sequelize");
const path = require("path");
const fs = require("fs");

// Fungsi untuk menambah transaksi baru
const addTransaction = async (userId, type, amount, categoryName, description = "") => {
  const t = await sequelize.transaction();

  try {
    // Cari kategori berdasarkan nama dan tipe (case insensitive)
    let category = await Category.findOne({
      where: {
        name: sequelize.where(sequelize.fn("LOWER", sequelize.col("name")), "LIKE", `%${categoryName.toLowerCase()}%`),
        type: type,
      },
    });

    // Jika kategori tidak ditemukan, buat kategori baru secara otomatis
    if (!category) {
      console.log(`Membuat kategori baru: ${categoryName} (${type})`);

      category = await Category.create(
        {
          name: categoryName,
          type: type,
          description: `Kategori ${type === "income" ? "pemasukan" : "pengeluaran"} otomatis`,
        },
        { transaction: t }
      );
    }

    // Buat transaksi baru
    const transaction = await Transaction.create(
      {
        userId,
        categoryId: category.id,
        type,
        amount,
        description,
        transactionDate: new Date(),
      },
      { transaction: t }
    );

    await t.commit();

    return {
      success: true,
      message: `Transaksi ${type === "income" ? "pemasukan" : "pengeluaran"} berhasil ditambahkan`,
      data: transaction,
    };
  } catch (error) {
    await t.rollback();
    console.error("Error adding transaction:", error);
    return {
      success: false,
      message: "Gagal menambahkan transaksi",
      error: error.message,
    };
  }
};

// Mendapatkan saldo saat ini
const getCurrentBalance = async (userId) => {
  try {
    // Dapatkan saldo awal pengguna
    const user = await User.findByPk(userId);
    if (!user) {
      return {
        success: false,
        message: "Pengguna tidak ditemukan",
      };
    }

    const initialBalance = parseFloat(user.initialBalance) || 0;

    // Hitung total pemasukan
    const totalIncome =
      (await Transaction.sum("amount", {
        where: {
          userId,
          type: "income",
        },
      })) || 0;

    // Hitung total pengeluaran
    const totalExpense =
      (await Transaction.sum("amount", {
        where: {
          userId,
          type: "expense",
        },
      })) || 0;

    // Hitung saldo saat ini
    const currentBalance = initialBalance + totalIncome - totalExpense;

    return {
      success: true,
      data: {
        initialBalance,
        income: totalIncome,
        expense: totalExpense,
        currentBalance,
      },
    };
  } catch (error) {
    console.error("Error getting balance:", error);
    return {
      success: false,
      message: "Gagal mendapatkan saldo",
      error: error.message,
    };
  }
};

// Mendapatkan laporan transaksi berdasarkan periode
const getTransactionReport = async (userId, options = {}) => {
  try {
    const {
      period = "day", // hari, minggu, bulan, tahun
      limit = 10, // jumlah maksimal transaksi
      category = null, // filter berdasarkan kategori
      startDate = null, // tanggal mulai custom (YYYY-MM-DD)
      endDate = null, // tanggal akhir custom (YYYY-MM-DD)
      groupByCategory = false, // apakah dikelompokkan per kategori
    } = options;

    let queryStartDate;
    let queryEndDate = new Date();

    // Set tanggal berdasarkan periode atau tanggal kustom
    if (startDate && isValidDate(startDate)) {
      queryStartDate = new Date(startDate);
      queryStartDate.setHours(0, 0, 0, 0);
    } else {
      const now = new Date();

      // Tentukan tanggal mulai berdasarkan periode
      if (typeof period === "string") {
        switch (period.toLowerCase()) {
          case "day":
          case "hari":
            queryStartDate = new Date(now);
            queryStartDate.setHours(0, 0, 0, 0);
            break;
          case "week":
          case "minggu":
            // Perbaikan logika minggu - Minggu dimulai dari Senin
            queryStartDate = new Date(now);
            // Mengambil hari dalam seminggu (0 = Minggu, 1 = Senin, ..., 6 = Sabtu)
            const dayOfWeek = queryStartDate.getDay();
            // Menghitung offset ke Senin (jika sekarang Minggu, mundur 6 hari. Jika Senin mundur 0, dst)
            const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            queryStartDate.setDate(queryStartDate.getDate() - offset);
            queryStartDate.setHours(0, 0, 0, 0);
            break;
          case "month":
          case "bulan":
            queryStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case "year":
          case "tahun":
            queryStartDate = new Date(now.getFullYear(), 0, 1);
            break;
          default:
            queryStartDate = new Date(now);
            queryStartDate.setHours(0, 0, 0, 0);
        }
      } else if (!isNaN(period)) {
        // Jika period adalah angka, ambil N transaksi terakhir
        queryStartDate = new Date(0); // Jan 1, 1970
      } else {
        // Fallback untuk tipe lainnya
        queryStartDate = new Date(now);
        queryStartDate.setHours(0, 0, 0, 0);
      }
    }

    console.log(`Filter periode: ${period}, tanggal mulai: ${queryStartDate.toISOString()}, tanggal akhir: ${queryEndDate.toISOString()}`);

    // Buat query dasar
    const where = {
      userId,
    };

    // Jika ada rentang tanggal, tambahkan ke query
    if (queryStartDate && queryEndDate) {
      where.transactionDate = {
        [Op.between]: [queryStartDate, queryEndDate],
      };
    }

    // Jika ada filter kategori
    if (category) {
      // Temukan ID kategori berdasarkan nama
      const categoryRecord = await Category.findOne({
        where: {
          name: sequelize.where(sequelize.fn("LOWER", sequelize.col("name")), "LIKE", `%${category.toLowerCase()}%`),
        },
      });

      if (categoryRecord) {
        where.categoryId = categoryRecord.id;
      }
    }

    // Dapatkan transaksi dengan batasan dan filter yang ditentukan
    let transactions;

    // Jika groupByCategory bernilai true, perlu query yang berbeda
    if (groupByCategory) {
      // Untuk laporan yang dikelompokkan per kategori
      transactions = await Transaction.findAll({
        where,
        include: [
          {
            model: Category,
            attributes: ["name", "type"],
          },
        ],
        order: [["transactionDate", "DESC"]],
      });
    } else {
      // Untuk laporan biasa dengan limit
      const limitOption = !isNaN(period) && Number(period) > 0 ? Number(period) : limit;

      transactions = await Transaction.findAll({
        where,
        include: [
          {
            model: Category,
            attributes: ["name", "type"],
          },
        ],
        order: [["transactionDate", "DESC"]],
        limit: limitOption,
      });
    }

    // Hitung total pemasukan dan pengeluaran
    let totalIncome = 0;
    let totalExpense = 0;
    let categoryGroups = {};

    transactions.forEach((transaction) => {
      const amountNum = parseFloat(transaction.amount) || 0;
      const categoryName = transaction.Category ? transaction.Category.name : "Tidak Terkategori";

      if (transaction.type === "income") {
        totalIncome += amountNum;
      } else {
        totalExpense += amountNum;
      }

      // Jika laporan dikelompokkan, tambahkan ke grup kategori
      if (groupByCategory) {
        if (!categoryGroups[categoryName]) {
          categoryGroups[categoryName] = {
            total: 0,
            transactions: [],
          };
        }

        categoryGroups[categoryName].total += amountNum;
        categoryGroups[categoryName].transactions.push({
          id: transaction.id,
          type: transaction.type,
          amount: amountNum,
          description: transaction.description || "",
          date: transaction.transactionDate,
          createdAt: transaction.createdAt,
        });
      }
    });

    const formattedTransactions = transactions.map((t) => {
      return {
        id: t.id,
        type: t.type,
        amount: parseFloat(t.amount) || 0,
        category: t.Category ? t.Category.name : "Tidak Terkategori",
        description: t.description || "",
        date: t.transactionDate,
        createdAt: t.createdAt,
      };
    });

    const netAmount = totalIncome - totalExpense;

    return {
      success: true,
      data: {
        transactions: formattedTransactions,
        categoryGroups: groupByCategory ? categoryGroups : null,
        totalIncome,
        totalExpense,
        netAmount,
        startDate: queryStartDate,
        endDate: queryEndDate,
        groupByCategory,
        transactionCount: transactions.length,
      },
    };
  } catch (error) {
    console.error("Error getting transaction report:", error);
    return {
      success: false,
      message: "Gagal mendapatkan laporan transaksi",
      error: error.message,
    };
  }
};

// Fungsi validasi format tanggal (YYYY-MM-DD)
const isValidDate = (dateString) => {
  if (!dateString) return false;

  // Validasi format YYYY-MM-DD
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;

  // Validasi tanggal yang valid
  const date = new Date(dateString);
  return !isNaN(date.getTime());
};

// Fungsi untuk membuat file laporan yang bisa diunduh
const generateReportFile = async (userId, options = {}) => {
  try {
    // Dapatkan data laporan
    const reportResult = await getTransactionReport(userId, options);

    if (!reportResult.success) {
      return reportResult;
    }

    const { transactions, totalIncome, totalExpense, netAmount, startDate, endDate } = reportResult.data;

    // Dapatkan informasi pengguna
    const user = await User.findByPk(userId);
    if (!user) {
      return {
        success: false,
        message: "Pengguna tidak ditemukan",
      };
    }

    // Format tanggal untuk nama file
    const fileDate = new Date().toISOString().split("T")[0];
    const fileName = `laporan_keuangan_${user.name.replace(/\s+/g, "_")}_${fileDate}.csv`;

    // Buat isi file CSV
    let csvContent = "Tanggal,Tipe,Jumlah,Kategori,Deskripsi\n";

    transactions.forEach((t) => {
      const date = new Date(t.date).toLocaleDateString("id-ID");
      const type = t.type === "income" ? "Pemasukan" : "Pengeluaran";
      const amount = t.amount.toString().replace(".", ",");

      // Escape deskripsi jika ada koma
      const description = t.description ? `"${t.description}"` : "";

      csvContent += `${date},${type},${amount},${t.category},${description}\n`;
    });

    // Tambahkan ringkasan
    csvContent += `\nTotal Pemasukan,${totalIncome.toString().replace(".", ",")}\n`;
    csvContent += `Total Pengeluaran,${totalExpense.toString().replace(".", ",")}\n`;
    csvContent += `Selisih,${netAmount.toString().replace(".", ",")}\n`;

    // File path untuk laporan (temporary)
    const filePath = path.join(__dirname, "../temp", fileName);

    // Pastikan folder temp ada
    if (!fs.existsSync(path.join(__dirname, "../temp"))) {
      fs.mkdirSync(path.join(__dirname, "../temp"));
    }

    // Tulis file
    fs.writeFileSync(filePath, csvContent);

    return {
      success: true,
      message: "File laporan berhasil dibuat",
      data: {
        fileName,
        filePath,
        recordCount: transactions.length,
        startDate,
        endDate,
      },
    };
  } catch (error) {
    console.error("Error generating report file:", error);
    return {
      success: false,
      message: "Gagal membuat file laporan",
      error: error.message,
    };
  }
};

module.exports = {
  addTransaction,
  getCurrentBalance,
  getTransactionReport,
  generateReportFile,
};
