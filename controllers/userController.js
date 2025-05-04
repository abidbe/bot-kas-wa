const { User } = require("../models/index");
const { Op } = require("sequelize");
// Import messageService sebagai pengganti bot.js
const messageService = require("../whatsapp/messageService");

// Register user baru
const registerUser = async (req, res) => {
  try {
    const { name, phoneNumber, initialBalance = 0 } = req.body;

    // Validasi input
    if (!name || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Nama dan nomor telepon harus diisi",
      });
    }

    // Format nomor telepon
    let formattedPhone = phoneNumber;

    // Jika dimulai dengan +, hapus
    if (formattedPhone.startsWith("+")) {
      formattedPhone = formattedPhone.substring(1);
    }

    // Jika dimulai dengan 0, ganti dengan 62
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "62" + formattedPhone.substring(1);
    }

    // Jika tidak dimulai dengan 62, tambahkan 62
    if (!formattedPhone.startsWith("62")) {
      formattedPhone = "62" + formattedPhone;
    }

    // Cek apakah nomor telepon sudah terdaftar
    const existingUser = await User.findOne({
      where: { phoneNumber: formattedPhone },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Nomor telepon sudah terdaftar",
      });
    }

    // Buat user baru - otomatis terverifikasi
    const user = await User.create({
      name,
      phoneNumber: formattedPhone,
      initialBalance,
      isVerified: true, // Langsung set terverifikasi
      verificationCode: null, // Tidak perlu kode verifikasi
    });

    // Kirim pesan selamat datang ke WhatsApp dalam background
    setTimeout(async () => {
      try {
        // Gunakan messageService untuk mengirim pesan selamat datang
        await messageService.sendWelcomeMessage(formattedPhone, name);
      } catch (msgError) {
        console.error("Error mengirim pesan selamat datang:", msgError);
      }
    }, 1000); // Tunggu 1 detik sebelum mencoba mengirim pesan

    // Kirim respon sukses tanpa menunggu pengiriman pesan WhatsApp
    res.status(201).json({
      success: true,
      message: "Pendaftaran berhasil! Untuk memulai, silakan kirim '/info' ke nomor WhatsApp bot.",
      data: {
        id: user.id,
        name: user.name,
        phoneNumber: formattedPhone,
      },
    });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat mendaftarkan pengguna",
      error: error.message,
    });
  }
};

// Fungsi getUserByPhone tetap dipertahankan
const getUserByPhone = async (phoneNumber) => {
  try {
    const user = await User.findOne({
      where: { phoneNumber },
    });

    if (!user) {
      return {
        success: false,
        message: "Pengguna tidak ditemukan",
      };
    }

    return {
      success: true,
      data: user,
    };
  } catch (error) {
    console.error("Error getting user:", error);
    return {
      success: false,
      message: "Terjadi kesalahan saat mencari pengguna",
      error: error.message,
    };
  }
};

module.exports = {
  registerUser,
  getUserByPhone,
};
