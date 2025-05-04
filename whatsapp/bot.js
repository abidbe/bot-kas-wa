const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const commands = require("./commands");
const messageService = require("./messageService");

// Inisialisasi client WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: "./whatsapp/session",
  }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// Event saat QR code perlu di-scan
client.on("qr", (qr) => {
  console.log("QR RECEIVED, silahkan scan dengan WhatsApp Anda!");
  qrcode.generate(qr, { small: true });
});

// Event saat client siap
client.on("ready", () => {
  console.log("Bot WhatsApp siap digunakan!");
  // Set client ke messageService saat siap
  messageService.setWhatsappClient(client);
});

// Event saat client mendeteksi pesan masuk
client.on("message", async (msg) => {
  // Abaikan pesan dari grup
  if (msg.isGroupMsg) return;

  try {
    await commands.handleMessage(client, msg);
  } catch (error) {
    console.error("Error handling message:", error);
    await msg.reply("Maaf, terjadi kesalahan saat memproses pesan Anda. Silakan coba lagi.");
  }
});

// Event saat client mendeteksi perubahan state koneksi
client.on("disconnected", (reason) => {
  console.log("Client disconnected:", reason);
  // Reconnect otomatis
  client.initialize();
});

// Fungsi untuk menginisialisasi client
const initializeBot = () => {
  console.log("Menginisialisasi WhatsApp Bot...");
  client.initialize().catch((err) => {
    console.error("Error initializing WhatsApp client:", err);
  });
};

// Fungsi untuk mengirim kode verifikasi
const sendVerificationCode = async (phoneNumber, code) => {
  try {
    // Format nomor telepon untuk WhatsApp (pastikan format: 62812345xxxx)
    const formattedPhone = phoneNumber.startsWith("62") ? `${phoneNumber}@c.us` : `62${phoneNumber.replace(/^0+/, "")}@c.us`;

    // Pesan verifikasi
    const message = `*KODE VERIFIKASI BOT KEUANGAN*\n\nBerikut adalah kode verifikasi untuk akun Anda:\n\n*${code}*\n\nUntuk verifikasi, silakan kirim pesan:\n/verifikasi ${code}\n\nKode ini berlaku untuk satu kali penggunaan dan akan kedaluwarsa dalam 24 jam.`;

    // Kirim pesan
    await client.sendMessage(formattedPhone, message);
    console.log(`Kode verifikasi terkirim ke ${phoneNumber}`);
    return true;
  } catch (error) {
    console.error(`Gagal mengirim kode verifikasi ke ${phoneNumber}:`, error);
    return false;
  }
};

client.on("authenticated", () => {
  console.log("WhatsApp client terotentikasi");
});

client.on("auth_failure", (msg) => {
  console.error("Autentikasi WhatsApp gagal:", msg);
});

client.on("disconnected", (reason) => {
  console.log("WhatsApp client terputus:", reason);
});

module.exports = {
  initializeBot,
  sendVerificationCode,
};
