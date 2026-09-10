// ask.js - نقطة الدخول الوحيدة يلي تطبيق بيلي بيستخدمها لطرح سؤال
const express = require("express");
const deviceAuth = require("../middleware/deviceAuth");
const { floodLimiter, monthlyLimitGuard } = require("../middleware/rateLimit");
const { askDeepSeek } = require("../services/deepseek");
const { logUsage } = require("../db");

const router = express.Router();

router.post("/ask", floodLimiter, deviceAuth, monthlyLimitGuard, async (req, res) => {
  const { question } = req.body || {};

  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "لازم ترسل حقل question نصي وغير فارغ" });
  }

  try {
    const { answer, tokensUsed } = await askDeepSeek(question.trim());

    // نسجل الاستخدام (بدون تخزين نص السؤال كامل، فقط أول 100 حرف كمعاينة)
    await logUsage(req.device.token, tokensUsed, question.trim().slice(0, 100));

    res.json({
      answer,
      tokensUsed,
      usedThisMonth: req.usedThisMonth + tokensUsed,
      monthlyLimit: req.device.monthly_limit,
    });
  } catch (err) {
    console.error("خطأ بالاتصال مع DeepSeek:", err.message);
    res.status(502).json({ error: "فشل الاتصال بخدمة الذكاء الاصطناعي، جرب لاحقاً" });
  }
});

module.exports = router;
