// File baru untuk mengisolasi fungsi pengiriman pesan

let whatsappClient = null;

// Fungsi untuk menyetel client dari bot.js
const setWhatsappClient = (client) => {
  whatsappClient = client;
};

// Fungsi untuk mengirim pesan selamat datang
const sendWelcomeMessage = async (phoneNumber, name) => {
  try {
    if (!whatsappClient) {
      console.log("WhatsApp client belum diinisialisasi");
      return false;
    }

    const formattedNumber = `${phoneNumber}@c.us`;
    const welcomeMessage = `*SELAMAT DATANG DI BOT KEUANGAN PRIBADI*\n\nHalo ${name},\n\nAkun Anda telah berhasil didaftarkan!\n\nGunakan perintah berikut:\n- /info - Untuk melihat semua perintah\n- /tambah [jumlah] [kategori] [deskripsi] - Untuk mencatat pengeluaran\n- /masuk [jumlah] [kategori] [deskripsi] - Untuk mencatat pemasukan\n- /saldo - Untuk melihat saldo saat ini\n- /laporan - Untuk melihat laporan transaksi`;

    await whatsappClient.sendMessage(formattedNumber, welcomeMessage);
    console.log(`Pesan selamat datang terkirim ke ${phoneNumber}`);
    return true;
  } catch (error) {
    console.error("Error mengirim pesan selamat datang:", error);
    return false;
  }
};

module.exports = {
  setWhatsappClient,
  sendWelcomeMessage,
};
