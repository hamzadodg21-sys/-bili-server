// admin.js - إدارة الأجهزة: إنشاء، تعديل، حذف، ومراقبة الاستخدام
const express = require("express");
const { nanoid } = require("nanoid");
const adminAuth = require("../middleware/adminAuth");
const {
  createDevice,
  getDevice,
  revokeDevice,
  unrevokeDevice,
  updateDevice,
  deleteDevice,
  getAllDevices,
  getStats,
  getMonthlyUsage,
  getDeviceUsageHistory,
} = require("../db");

const router = express.Router();

router.use(adminAuth); // كل نقاط هالملف محمية بـ X-Admin-Secret

// ============================================================
//  1) إنشاء رمز تفعيل جديد لجهاز
// ============================================================
router.post("/devices", async (req, res) => {
  const { label, monthlyLimit } = req.body || {};

  const token = nanoid(32);
  const device = await createDevice(token, label || "", monthlyLimit || 1000);

  res.status(201).json({
    token: device.token,
    label: device.label,
    monthlyLimit: device.monthly_limit,
    createdAt: device.created_at,
  });
});

// ============================================================
//  2) عرض كل الأجهزة (مع بحث + Pagination)
//  GET /admin/devices?search=&page=1&limit=20
// ============================================================
router.get("/devices", async (req, res) => {
  const search = (req.query.search || "").toString();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const { devices, total } = await getAllDevices({ search, limit, offset });

  res.json({
    devices,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ============================================================
//  3) إحصائيات عامة
// ============================================================
router.get("/stats", async (req, res) => {
  const stats = await getStats();
  res.json(stats);
});

// ============================================================
//  4) إلغاء تفعيل جهاز
// ============================================================
router.post("/devices/:token/revoke", async (req, res) => {
  const device = await revokeDevice(req.params.token);

  if (!device) {
    return res.status(404).json({ error: "الرمز غير موجود" });
  }

  res.json({ token: device.token, revoked: device.revoked });
});

// ============================================================
//  5) إعادة تفعيل جهاز
// ============================================================
router.post("/devices/:token/unrevoke", async (req, res) => {
  const device = await unrevokeDevice(req.params.token);

  if (!device) {
    return res.status(404).json({ error: "الرمز غير موجود" });
  }

  res.json({ token: device.token, revoked: device.revoked });
});

// ============================================================
//  6) تعديل بيانات جهاز (label / monthlyLimit / notes)
// ============================================================
router.patch("/devices/:token", async (req, res) => {
  const { label, monthlyLimit, notes } = req.body || {};

  const device = await updateDevice(req.params.token, {
    label,
    monthlyLimit,
    notes,
  });

  if (!device) {
    return res.status(404).json({ error: "الرمز غير موجود" });
  }

  res.json({
    token: device.token,
    label: device.label,
    monthlyLimit: device.monthly_limit,
    notes: device.notes,
    revoked: device.revoked,
    updatedAt: device.updated_at,
  });
});

// ============================================================
//  7) حذف جهاز نهائياً
// ============================================================
router.delete("/devices/:token", async (req, res) => {
  const deleted = await deleteDevice(req.params.token);

  if (!deleted) {
    return res.status(404).json({ error: "الرمز غير موجود" });
  }

  res.json({ success: true, message: "تم حذف الجهاز نهائياً" });
});

// ============================================================
//  8) مراقبة استخدام جهاز خلال الشهر الحالي
// ============================================================
router.get("/devices/:token/usage", async (req, res) => {
  const device = await getDevice(req.params.token);

  if (!device) {
    return res.status(404).json({ error: "الرمز غير موجود" });
  }

  const usedThisMonth = await getMonthlyUsage(device.token);

  res.json({
    token: device.token,
    label: device.label,
    monthlyLimit: device.monthly_limit,
    usedThisMonth,
    revoked: device.revoked,
    lastUsedAt: device.last_used_at,
    notes: device.notes,
  });
});

// ============================================================
//  9) سجل استخدام جهاز (آخر 20 سجل افتراضياً)
//  GET /admin/devices/:token/logs?limit=50
// ============================================================
router.get("/devices/:token/logs", async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

  const device = await getDevice(req.params.token);
  if (!device) {
    return res.status(404).json({ error: "الرمز غير موجود" });
  }

  const logs = await getDeviceUsageHistory(req.params.token, limit);

  res.json({
    token: device.token,
    label: device.label,
    logs,
  });
});

module.exports = router;
