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

  // ✅ إضافة أعمدة جديدة (آمنة - فقط إذا لم تكن موجودة)
  await pool.query(`
    ALTER TABLE devices
      ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS notes        TEXT DEFAULT '';
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

// ============================================================
//  دوال الأجهزة (الأساسية)
// ============================================================

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
    `UPDATE devices SET revoked = TRUE, updated_at = NOW() WHERE token = $1 RETURNING *`,
    [token]
  );
  return result.rows[0] || null;
}

// ============================================================
//  دوال جديدة للوحة الإدارة
// ============================================================

/**
 * عرض كل الأجهزة مع Pagination + بحث اختياري
 * @param {Object} options - { search, limit, offset }
 * @returns {Object} - { devices, total }
 */
async function getAllDevices({ search = "", limit = 20, offset = 0 } = {}) {
  const searchPattern = `%${search.toLowerCase()}%`;

  // جلب الأجهزة
  const devicesResult = await pool.query(
    `SELECT
        token, label, monthly_limit, revoked,
        created_at, last_used_at, updated_at, notes
     FROM devices
     WHERE LOWER(token) LIKE $1 OR LOWER(label) LIKE $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [searchPattern, limit, offset]
  );

  // جلب العدد الكلي (بدون LIMIT)
  const countResult = await pool.query(
    `SELECT COUNT(*) AS total
     FROM devices
     WHERE LOWER(token) LIKE $1 OR LOWER(label) LIKE $1`,
    [searchPattern]
  );

  return {
    devices: devicesResult.rows,
    total: parseInt(countResult.rows[0].total, 10),
  };
}

/**
 * إحصائيات عامة للوحة الإدارة
 * @returns {Object} - { totalDevices, activeDevices, revokedDevices, monthlyTokensUsed }
 */
async function getStats() {
  const devicesStats = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE revoked = FALSE) AS active,
      COUNT(*) FILTER (WHERE revoked = TRUE) AS revoked
    FROM devices
  `);

  const usageStats = await pool.query(`
    SELECT COALESCE(SUM(tokens_used), 0) AS total
    FROM usage_log
    WHERE created_at >= date_trunc('month', NOW())
  `);

  return {
    totalDevices: parseInt(devicesStats.rows[0].total, 10),
    activeDevices: parseInt(devicesStats.rows[0].active, 10),
    revokedDevices: parseInt(devicesStats.rows[0].revoked, 10),
    monthlyTokensUsed: parseInt(usageStats.rows[0].total, 10),
  };
}

/**
 * تحديث بيانات جهاز (label / monthly_limit / notes)
 * @param {string} token
 * @param {Object} fields - { label, monthlyLimit, notes }
 * @returns {Object|null} - الجهاز المحدث أو null
 */
async function updateDevice(token, { label, monthlyLimit, notes } = {}) {
  const updates = [];
  const values = [];
  let idx = 1;

  if (label !== undefined) {
    updates.push(`label = $${idx++}`);
    values.push(label);
  }
  if (monthlyLimit !== undefined) {
    updates.push(`monthly_limit = $${idx++}`);
    values.push(monthlyLimit);
  }
  if (notes !== undefined) {
    updates.push(`notes = $${idx++}`);
    values.push(notes);
  }

  if (updates.length === 0) {
    return getDevice(token); // لا شيء للتعديل
  }

  updates.push(`updated_at = NOW()`);
  values.push(token);

  const result = await pool.query(
    `UPDATE devices SET ${updates.join(", ")} WHERE token = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

/**
 * إعادة تفعيل جهاز (إلغاء revoked)
 * @param {string} token
 * @returns {Object|null}
 */
async function unrevokeDevice(token) {
  const result = await pool.query(
    `UPDATE devices SET revoked = FALSE, updated_at = NOW() WHERE token = $1 RETURNING *`,
    [token]
  );
  return result.rows[0] || null;
}

/**
 * حذف جهاز نهائياً + كل سجلات استخدامه
 * @param {string} token
 * @returns {boolean} - true إذا حُذف
 */
async function deleteDevice(token) {
  // حذف سجلات الاستخدام أولاً (بسبب Foreign Key)
  await pool.query(`DELETE FROM usage_log WHERE device_token = $1`, [token]);
  const result = await pool.query(`DELETE FROM devices WHERE token = $1`, [token]);
  return result.rowCount > 0;
}

/**
 * جلب سجل استخدام جهاز معين
 * @param {string} token
 * @param {number} limit
 * @returns {Array}
 */
async function getDeviceUsageHistory(token, limit = 20) {
  const result = await pool.query(
    `SELECT id, tokens_used, question_preview, created_at
     FROM usage_log
     WHERE device_token = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [token, limit]
  );
  return result.rows;
}

/**
 * تحديث تاريخ آخر استخدام لجهاز (يُستدعى من ask.js بعد كل سؤال)
 * @param {string} token
 */
async function updateLastUsedAt(token) {
  await pool.query(
    `UPDATE devices SET last_used_at = NOW() WHERE token = $1`,
    [token]
  );
}

// ============================================================
//  دوال الاستخدام (الموجودة سابقاً)
// ============================================================

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
  // دوال الأجهزة
  createDevice,
  getDevice,
  revokeDevice,
  unrevokeDevice,
  updateDevice,
  deleteDevice,
  getAllDevices,
  getStats,
  // دوال الاستخدام
  getMonthlyUsage,
  logUsage,
  getDeviceUsageHistory,
  updateLastUsedAt,
};
