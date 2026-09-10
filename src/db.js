// db.js - الاتصال بقاعدة بيانات PostgreSQL (Neon / Supabase)
// كل التعامل مع قاعدة البيانات (أجهزة + سجل استخدام) موجود هون فقط.

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL غير موجود بملف .env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // مطلوب غالباً مع Neon/Supabase
});

// إنشاء الجداول إذا مش موجودة (يُستدعى مرة وحدة عند إقلاع السيرفر)
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS devices (
      token           TEXT PRIMARY KEY,
      label           TEXT NOT NULL DEFAULT '',
      monthly_limit   INTEGER NOT NULL DEFAULT 1000,
      revoked         BOOLEAN NOT NULL DEFAULT FALSE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usage_log (
      id              SERIAL PRIMARY KEY,
      device_token    TEXT NOT NULL REFERENCES devices(token),
      tokens_used     INTEGER NOT NULL,
      question_preview TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_usage_log_device_date
    ON usage_log (device_token, created_at);
  `);

  console.log("✅ قاعدة البيانات جاهزة (PostgreSQL)");
}

// --- دوال الأجهزة ---

async function createDevice(token, label, monthlyLimit) {
  const result = await pool.query(
    `INSERT INTO devices (token, label, monthly_limit)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [token, label, monthlyLimit]
  );
  return result.rows[0];
}

async function getDevice(token) {
  const result = await pool.query(`SELECT * FROM devices WHERE token = $1`, [token]);
  return result.rows[0] || null;
}

async function revokeDevice(token) {
  const result = await pool.query(
    `UPDATE devices SET revoked = TRUE WHERE token = $1 RETURNING *`,
    [token]
  );
  return result.rows[0] || null;
}

// --- دوال الاستخدام ---

// مجموع التوكنات المستهلكة من بداية الشهر الحالي (توقيت UTC) لهذا الجهاز
async function getMonthlyUsage(token) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(tokens_used), 0) AS total
     FROM usage_log
     WHERE device_token = $1
       AND created_at >= date_trunc('month', NOW())`,
    [token]
  );
  return parseInt(result.rows[0].total, 10);
}

async function logUsage(token, tokensUsed, questionPreview) {
  await pool.query(
    `INSERT INTO usage_log (device_token, tokens_used, question_preview)
     VALUES ($1, $2, $3)`,
    [token, tokensUsed, questionPreview]
  );
}

module.exports = {
  pool,
  initDb,
  createDevice,
  getDevice,
  revokeDevice,
  getMonthlyUsage,
  logUsage,
};
