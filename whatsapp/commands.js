const userController = require("../controllers/userController");
const transactionController = require("../controllers/transactionController");
const { MessageMedia } = require("whatsapp-web.js");
const fs = require("fs");

// Format pesan info dengan contoh yang lebih jelas dan emoji
const helpMessage = `*✨ info BOT KEUANGAN PRIBADI ✨*

Berikut adalah perintah yang tersedia:

*💸 Transaksi*
[jumlah], [kategori], [keterangan] - Tambah pengeluaran (default)
/masuk [jumlah], [kategori], [keterangan] - Tambah pemasukan

*📊 Laporan*
/saldo (/s) - Lihat saldo saat ini
/laporan (/l) - Lihat laporan hari ini
/lh - Laporan hari ini
/lm - Laporan minggu ini
/lb - Laporan bulan ini
/lt - Laporan tahun ini

*ℹ️ Lainnya*
/info (/i) - Tampilkan pesan info ini

*📝 Alias Singkat:*
/s - Cek saldo
/l - Laporan hari ini
/t - Tambah pengeluaran
/m - Tambah pemasukan

*Contoh:*
50000, Makanan, Makan siang di warteg
/m 1000000, Gaji, Gaji bulanan`;

// Parse command dari pesan
const parseCommand = (text) => {
  if (!text) return null;

  // Cek commands yang diawali dengan /
  if (text.startsWith("/")) {
    const parts = text.trim().split(" ");
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(" "); // Join semua argumen sebagai string
    return { command, args };
  }

  // Jika tidak ada / di awal, anggap sebagai pengeluaran (default command)
  return { command: "/tambah", args: text };
};

// Parse argumen berdasarkan pemisah koma
const parseArgs = (argsString) => {
  // Split berdasarkan koma dan hapus spasi di awal/akhir
  const parts = argsString.split(",").map((part) => part.trim());

  // Jika kurang dari 2 bagian, format tidak valid
  if (parts.length < 2) {
    return null;
  }

  const amount = parseFloat(parts[0].replace(/\./g, "").replace(/,/g, "."));
  const category = parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase();
  // Gabungkan semua bagian setelah category sebagai description (jika ada)
  const description = parts.length > 2 ? parts.slice(2).join(", ") : "";

  return { amount, category, description };
};

// Format angka sebagai mata uang rupiah
const formatCurrency = (amount) => {
  // Jika amount adalah NaN, gunakan 0
  const safeAmount = isNaN(amount) ? 0 : amount;

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeAmount);
};

// Handle tambah transaksi
const handleAddTransaction = async (msg, type, argsString) => {
  const phoneNumber = msg.from.replace("@c.us", "");

  // Cek apakah user terdaftar
  const userResult = await userController.getUserByPhone(phoneNumber);

  if (!userResult.success) {
    return msg.reply("❌ *Akun tidak ditemukan!*\n\nAnda belum terdaftar. Silakan daftar terlebih dahulu melalui halaman web.");
  }

  // Parse arguments
  const args = parseArgs(argsString);

  if (!args) {
    return msg.reply(`❌ *Format tidak valid*\n\nGunakan: ${type === "expense" ? "" : "/masuk "}[jumlah], [kategori], [keterangan]\n\n*Contoh:*\n${type === "expense" ? "50000, Makanan, Makan siang" : "/masuk 1000000, Gaji, Gaji bulanan"}`);
  }

  if (isNaN(args.amount) || args.amount <= 0) {
    return msg.reply("❌ *Jumlah tidak valid*\n\nJumlah harus berupa angka positif.");
  }

  // Tambah transaksi
  const transactionType = type === "expense" ? "expense" : "income";
  const result = await transactionController.addTransaction(userResult.data.id, transactionType, args.amount, args.category, args.description);

  if (result.success) {
    const emoji = type === "expense" ? "[-]" : "[+]";
    const formattedAmount = formatCurrency(args.amount);

    return msg.reply(
      `${emoji} *Transaksi Berhasil!*\n\n` +
        `*Tipe:* ${type === "expense" ? "Pengeluaran" : "Pemasukan"}\n` +
        `*Jumlah:* ${formattedAmount}\n` +
        `*Kategori:* ${args.category}\n` +
        `*Deskripsi:* ${args.description || "-"}\n\n` +
        `✅ Transaksi telah dicatat pada ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`
    );
  } else {
    return msg.reply(`❌ *Gagal mencatat transaksi*\n\n${result.message}`);
  }
};

// Handle melihat saldo
const handleCheckBalance = async (msg) => {
  const phoneNumber = msg.from.replace("@c.us", "");

  // Cek apakah user terdaftar
  const userResult = await userController.getUserByPhone(phoneNumber);

  if (!userResult.success) {
    return msg.reply("❌ *Akun tidak ditemukan!*\n\nAnda belum terdaftar. Silakan daftar terlebih dahulu melalui halaman web.");
  }

  // Dapatkan saldo terkini
  const result = await transactionController.getCurrentBalance(userResult.data.id);

  if (result.success) {
    const { initialBalance, income, expense, currentBalance } = result.data;

    return msg.reply(
      `💰 *INFORMASI SALDO*\n\n` +
        `*Nama:* ${userResult.data.name}\n` +
        `*Tanggal:* ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}\n\n` +
        `*Saldo Awal:* ${formatCurrency(initialBalance)}\n` +
        `*Total Pemasukan:* ${formatCurrency(income)} ⬆️\n` +
        `*Total Pengeluaran:* ${formatCurrency(expense)} ⬇️\n` +
        `*─────────────────*\n` +
        `*Saldo Saat Ini:* ${formatCurrency(currentBalance)} ${currentBalance < 0 ? "😱" : "😊"}\n\n` +
        `Untuk melihat laporan transaksi, ketik */laporan*`
    );
  } else {
    return msg.reply(`❌ *Gagal mendapatkan saldo*\n\n${result.message}`);
  }
};

// Handle laporan transaksi
const handleTransactionReport = async (client, msg, args = "") => {
  // Jika parameter diberikan dalam urutan yang salah, perbaiki
  if (typeof client === "object" && client.hasOwnProperty("from") && typeof msg === "string") {
    // Format parameter salah, sesuaikan
    const tempMsg = client;
    const tempArgs = msg;
    client = undefined; // Set ke undefined karena tidak ada
    msg = tempMsg;
    args = tempArgs || "";
  }

  // Pastikan msg valid
  if (!msg || !msg.from) {
    console.error("Invalid message object in handleTransactionReport:", msg);
    return;
  }
  const phoneNumber = msg.from.replace("@c.us", "");

  // Cek apakah user terdaftar
  const userResult = await userController.getUserByPhone(phoneNumber);

  if (!userResult.success) {
    return msg.reply("❌ *Akun tidak ditemukan!*\n\nAnda belum terdaftar. Silakan daftar terlebih dahulu melalui halaman web.");
  }

  // Parse argumen
  const options = parseReportOptions(args);

  // Dapatkan laporan transaksi
  const result = await transactionController.getTransactionReport(userResult.data.id, options);

  if (result.success) {
    const { transactions, categoryGroups, totalIncome, totalExpense, netAmount, startDate, endDate, groupByCategory, transactionCount } = result.data;

    // Teks periode yang sesuai
    let periodText;

    if (options.startDate && options.endDate) {
      const startFormatted = new Date(startDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
      const endFormatted = new Date(endDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
      periodText = `${startFormatted} s/d ${endFormatted}`;
    } else if (options.startDate) {
      const startFormatted = new Date(startDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
      periodText = `Sejak ${startFormatted}`;
    } else if (!isNaN(options.period)) {
      periodText = `${options.period} Transaksi Terakhir`;
    } else {
      switch (options.period.toLowerCase()) {
        case "day":
        case "hari":
          periodText = "Hari Ini";
          break;
        case "week":
        case "minggu":
          periodText = "Minggu Ini";
          break;
        case "month":
        case "bulan":
          periodText = "Bulan Ini";
          break;
        case "year":
        case "tahun":
          periodText = "Tahun Ini";
          break;
        default:
          periodText = "Hari Ini";
      }
    }

    let reply = `📊 *LAPORAN TRANSAKSI ${periodText.toUpperCase()}*\n\n`;

    // Tambahkan ringkasan dengan pengecekan NaN
    const safeIncome = isNaN(totalIncome) ? 0 : totalIncome;
    const safeExpense = isNaN(totalExpense) ? 0 : totalExpense;
    const safeNetAmount = isNaN(netAmount) ? 0 : netAmount;

    reply += `*Ringkasan:*\n`;
    reply += `▫️ Total Pemasukan: ${formatCurrency(safeIncome)} 💰\n`;
    reply += `▫️ Total Pengeluaran: ${formatCurrency(safeExpense)} 💸\n`;
    reply += `▫️ *Selisih: ${formatCurrency(safeNetAmount)}* ${safeNetAmount >= 0 ? "✅" : "❗"}\n\n`;

    // Jika tidak ada transaksi
    if (!transactions || transactions.length === 0) {
      reply += `Tidak ada transaksi dalam periode ${periodText.toLowerCase()}.`;
    } else {
      // Jika groupByCategory aktif
      if (groupByCategory && categoryGroups) {
        // Tampilkan laporan per kategori
        // ...kode untuk laporan per kategori tetap sama

        reply += `*Laporan Per Kategori:*\n\n`;

        // Urutkan kategori berdasarkan total
        const sortedCategories = Object.keys(categoryGroups).sort((a, b) => categoryGroups[b].total - categoryGroups[a].total);

        for (const category of sortedCategories) {
          const group = categoryGroups[category];
          reply += `*${category}*: ${formatCurrency(group.total)}\n`;

          // Tampilkan 3 transaksi teratas per kategori
          const topTransactions = group.transactions.slice(0, 3);
          topTransactions.forEach((t) => {
            const dateTime = formatTransactionDateTime(t.createdAt);
            const icon = t.type === "income" ? "[+]" : "[-]";
            reply += `  ${icon} ${dateTime}: ${t.description || "-"} (${formatCurrency(t.amount)})\n`;
          });

          // Jika ada lebih dari 3 transaksi di kategori ini
          if (group.transactions.length > 3) {
            reply += `  ...dan ${group.transactions.length - 3} transaksi lainnya\n`;
          }

          reply += `\n`;
        }
      } else {
        // Kelompokkan transaksi berdasarkan tanggal
        const transactionsByDate = groupTransactionsByDate(transactions);

        // Tampilkan daftar transaksi normal dikelompokkan per hari
        reply += `*Daftar Transaksi:*\n`;

        Object.keys(transactionsByDate).forEach((dateKey) => {
          const dateTransactions = transactionsByDate[dateKey];
          const dayDate = new Date(dateKey);

          // Format header tanggal: Senin, 4 Mei 2025
          const dateHeader = dayDate.toLocaleDateString("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          });

          reply += `\n📅 *${dateHeader}*\n\n`;

          // Urutkan transaksi berdasarkan waktu (terbaru diatas)
          dateTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

          // Tampilkan transaksi untuk hari ini
          dateTransactions.forEach((transaction) => {
            const icon = transaction.type === "income" ? "[+]" : "[-]";

            // Format waktu dengan jam:menit dari transactionDate
            let timeText = "";
            try {
              if (transaction.date) {
                const transactionTime = new Date(transaction.date);
                if (!isNaN(transactionTime.getTime())) {
                  timeText = transactionTime.toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                }
              }
            } catch (err) {
              console.error("Error formatting time:", err);
              timeText = "??:??";
            }

            // Format jumlah dengan fallback ke 0 jika NaN
            const safeAmount = isNaN(transaction.amount) ? 0 : transaction.amount;
            const amount = formatCurrency(safeAmount);

            // Pastikan timeText tidak kosong dan ditampilkan dengan benar
            reply += `${icon} ${timeText || "??:??"} | ${amount}\n`;
            reply += `  ${transaction.category || "Tidak Terkategori"}: ${transaction.description || "-"}\n`;
          });
        });
      }

      // Tampilkan informasi tambahan dan bantuan
      if (transactions.length < transactionCount) {
        reply += `\n*Total ${transactions.length} dari ${transactionCount} transaksi ditampilkan*\n`;
      }
      reply += `\nKetik */laporan bantuan* untuk opsi filter lebih lanjut`;
    }

    // Jika ada opsi export dan transaksi tidak kosong
    if (options.export && transactions.length > 0) {
      const fileResult = await transactionController.generateReportFile(userResult.data.id, options);

      if (fileResult.success) {
        await msg.reply(reply);

        // Sekarang client sudah didefinisikan sebagai parameter
        await client.sendMessage(msg.from, MessageMedia.fromFilePath(fileResult.data.filePath), {
          caption: `📊 Laporan Keuangan (${fileResult.data.recordCount} transaksi)\nPeriode: ${periodText}`,
          sendMediaAsDocument: true,
        });

        // Hapus file temporari
        fs.unlinkSync(fileResult.data.filePath);
        return;
      } else {
        reply += `\n\n❌ *Gagal membuat file laporan:* ${fileResult.message}`;
      }
    }

    return msg.reply(reply);
  } else {
    return msg.reply(`❌ *Gagal mendapatkan laporan*\n\n${result.message}`);
  }
};

const groupTransactionsByDate = (transactions) => {
  const grouped = {};

  transactions.forEach((transaction) => {
    try {
      // Gunakan transactionDate bukan date atau createdAt
      const date = new Date(transaction.transactionDate || transaction.date);
      const dateKey = date.toISOString().split("T")[0]; // YYYY-MM-DD format

      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }

      grouped[dateKey].push(transaction);
    } catch (error) {
      console.error("Error grouping transaction by date:", error);
    }
  });

  // Urutkan tanggal dari yang terbaru
  return Object.keys(grouped)
    .sort((a, b) => new Date(b) - new Date(a))
    .reduce((result, key) => {
      result[key] = grouped[key];
      return result;
    }, {});
};

const formatTransactionDateTime = (transaction) => {
  try {
    const dt = new Date(transaction.transactionDate || transaction.date);
    if (isNaN(dt.getTime())) return "Tanggal tidak valid";

    return dt.toLocaleString("id-ID", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (err) {
    console.error("Error formatting date time:", err);
    return "Tanggal tidak valid";
  }
};

// Parse opsi laporan dari string argumen
const parseReportOptions = (args) => {
  // Default options
  const options = {
    period: "day",
    limit: 10,
    category: null,
    startDate: null,
    endDate: null,
    groupByCategory: false,
    export: false,
  };

  if (!args) return options;

  const argParts = args.trim().toLowerCase().split(" ");

  // Penanganan argumen tunggal
  if (argParts.length === 1) {
    const arg = argParts[0];

    // Cek apakah ini adalah angka (jumlah transaksi)
    if (!isNaN(arg) && parseInt(arg) > 0) {
      options.period = parseInt(arg);
      options.limit = parseInt(arg);
      return options;
    }

    // Cek apakah ini adalah periode yang valid
    if (["hari", "day", "minggu", "week", "bulan", "month", "tahun", "year"].includes(arg)) {
      options.period = arg;
      return options;
    }

    // Cek apakah ini adalah opsi khusus
    if (arg === "kategori") {
      options.groupByCategory = true;
      return options;
    }

    if (arg === "export" || arg === "ekspor") {
      options.export = true;
      return options;
    }

    // Jika tidak cocok dengan opsi di atas, anggap sebagai kategori
    options.category = arg;
    return options;
  }

  // Penanganan argumen lebih dari satu
  for (let i = 0; i < argParts.length; i++) {
    const arg = argParts[i];

    if (arg === "kategori" || arg === "category") {
      options.groupByCategory = true;
    } else if (arg === "export" || arg === "ekspor") {
      options.export = true;
    } else if (arg === "dari" || arg === "from") {
      if (i + 1 < argParts.length) {
        // Format tanggal: dari 2023-05-01
        options.startDate = argParts[i + 1];
        i++;
      }
    } else if (arg === "sampai" || arg === "to") {
      if (i + 1 < argParts.length) {
        // Format tanggal: sampai 2023-05-31
        options.endDate = argParts[i + 1];
        i++;
      }
    } else if (["hari", "day", "minggu", "week", "bulan", "month", "tahun", "year"].includes(arg)) {
      options.period = arg;
    } else if (!isNaN(arg) && parseInt(arg) > 0) {
      options.period = parseInt(arg);
      options.limit = parseInt(arg);
    } else {
      // Anggap sebagai kategori jika tidak ada match lain
      options.category = arg;
    }
  }

  return options;
};

const helpReportMessage = `*📊 PANDUAN LAPORAN TRANSAKSI*

*Format Dasar:*
/laporan [opsi] atau /l [opsi]

*Alias Singkat:*
/lh - Laporan hari ini
/lm - Laporan minggu ini
/lb - Laporan bulan ini
/lt - Laporan tahun ini
/lk - Laporan per kategori

*Periode Waktu:*
/l hari - Laporan hari ini
/l minggu - Laporan minggu ini
/l bulan - Laporan bulan ini
/l tahun - Laporan tahun ini

*Jumlah Transaksi:*
/l 5 - Tampilkan 5 transaksi terakhir
/l 20 - Tampilkan 20 transaksi terakhir

*Filter Kategori:*
/l makanan - Laporan transaksi kategori Makanan
/l transportasi - Laporan transaksi kategori Transportasi

*Filter Tanggal:*
/l dari 2023-05-01 - Laporan sejak 1 Mei 2023
/l dari 2023-05-01 sampai 2023-05-31 - Laporan periode tertentu

*Laporan Per Kategori:*
/l kategori - Laporan dikelompokkan per kategori
/lb kategori - Laporan bulan ini per kategori

*Ekspor Laporan:*
/l export - Ekspor laporan hari ini sebagai file CSV
/lb export - Ekspor laporan bulan ini

*Contoh Kombinasi:*
/l makanan 10 - 10 transaksi terakhir kategori Makanan
/lb kategori - Laporan bulan ini per kategori`;

// Main function untuk handle pesan
const handleMessage = async (client, msg) => {
  // Ignore non-text messages
  if (!msg.body) return;

  const parsedCommand = parseCommand(msg.body);

  // Jika bukan command, abaikan
  if (!parsedCommand) return;

  const { command, args } = parsedCommand;

  try {
    switch (command) {
      // Info commands
      case "/info":
      case "/bantuan":
      case "/help":
      case "/h":
      case "/i":
        await msg.reply(helpMessage);
        break;

      // Add expense commands
      case "/tambah":
      case "/t":
      case "/keluar":
      case "/k":
      case "/expense":
      case "/e":
        await handleAddTransaction(msg, "expense", args);
        break;

      // Add income commands
      case "/masuk":
      case "/m":
      case "/income":
      case "/i":
      case "/in":
        await handleAddTransaction(msg, "income", args);
        break;

      // Balance commands
      case "/saldo":
      case "/s":
      case "/balance":
      case "/b":
        await handleCheckBalance(msg);
        break;

      // Report commands
      case "/laporan":
      case "/l":
      case "/report":
      case "/r":
        if (args && args.trim().toLowerCase() === "bantuan") {
          await msg.reply(helpReportMessage);
        } else {
          // Panggil dengan urutan parameter yang benar
          await handleTransactionReport(client, msg, args);
        }
        break;

      // Quick aliases for common reports
      case "/lh": // Laporan Hari ini
        // Panggil dengan urutan parameter yang benar
        await handleTransactionReport(client, msg, "hari");
        break;

      case "/lm": // Laporan Minggu ini
        await handleTransactionReport(client, msg, "minggu");
        break;

      case "/lb": // Laporan Bulan ini
        await handleTransactionReport(client, msg, "bulan");
        break;

      case "/lt": // Laporan Tahun ini
        await handleTransactionReport(client, msg, "tahun");
        break;

      case "/lk": // Laporan Kategori
        await handleTransactionReport(client, msg, "kategori");
        break;

      default:
        await msg.reply(`❓ *Perintah tidak dikenali*\n\nKetik */info* atau */h* untuk melihat daftar perintah yang tersedia.`);
    }
  } catch (error) {
    console.error("Error processing command:", error);
    await msg.reply("❌ *Terjadi kesalahan*\n\nMaaf, terjadi kesalahan saat memproses perintah Anda. Silakan coba lagi.");
  }
};

module.exports = {
  handleMessage,
};
