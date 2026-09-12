// index.js - نقطة الدخول: يربط الميدلوير والراوترات ويشغّل السيرفر
require("dotenv").config();

const express = require("express");
const path = require("path");
const { initDb } = require("./db");
const askRouter = require("./routes/ask");
const adminRouter = require("./routes/admin");

const app = express();
app.use(express.json({ limit: "50kb" }));

// ✅ خدمة الملفات الثابتة من مجلد public/ (لوحة الإدارة، صفحات، صور)
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/", askRouter);
app.use("/admin", adminRouter);

// معالج أخطاء عام (احتياطي)
app.use((err, req, res, next) => {
  console.error("خطأ غير متوقع:", err);
  res.status(500).json({ error: "خطأ داخلي بالسيرفر" });
});

const PORT = process.env.PORT || 3000;

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`🚀 سيرفر بيلي شغال على http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("❌ فشل إقلاع السيرفر:", err);
  process.exit(1);
});
