// admin.js - إدارة الأجهزة: إنشاء رمز تفعيل، إلغاءه، ومراقبة استخدامه
const express = require("express");
const { nanoid } = require("nanoid");
const adminAuth = require("../middleware/adminAuth");
const { createDevice, getDevice, revokeDevice, getMonthlyUsage } = require("../db");

const router = express.Router();

router.use(adminAuth); // كل نقاط هالملف محمية بـ X-Admin-Secret

// إنشاء رمز تفعيل جديد لجهاز
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

// إلغاء تفعيل جهاز
router.post("/devices/:token/revoke", async (req, res) => {
  const device = await revokeDevice(req.params.token);

  if (!device) {
    return res.status(404).json({ error: "الرمز غير موجود" });
  }

  res.json({ token: device.token, revoked: device.revoked });
});

// مراقبة استخدام جهاز خلال الشهر الحالي
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
  });
});

module.exports = router;
