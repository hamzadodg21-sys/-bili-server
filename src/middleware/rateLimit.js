// rateLimit.js
// 1) floodLimiter: يمنع إرسال عدد كبير جداً من الطلبات بوقت قصير (لكل IP)
// 2) monthlyLimitGuard: يتحقق إنه الجهاز ما تجاوز سقفه الشهري من التوكنات قبل ما ينفذ الطلب

const rateLimit = require("express-rate-limit");
const { getMonthlyUsage } = require("../db");

// حماية فيضان بسيطة: 20 طلب بالدقيقة الواحدة لكل IP
const floodLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات كتيرة بوقت قصير، جرب بعد شوي" },
});

// يتحقق من السقف الشهري المخصص لكل جهاز (device.monthly_limit)
async function monthlyLimitGuard(req, res, next) {
  try {
    const device = req.device; // deviceAuth لازم يكون نفّذ قبل هاد الـ middleware
    const usedThisMonth = await getMonthlyUsage(device.token);

    if (usedThisMonth >= device.monthly_limit) {
      return res.status(429).json({
        error: "تم الوصول للسقف الشهري المسموح لهذا الجهاز",
        monthlyLimit: device.monthly_limit,
        usedThisMonth,
      });
    }

    req.usedThisMonth = usedThisMonth;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { floodLimiter, monthlyLimitGuard };
