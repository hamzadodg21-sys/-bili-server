// deviceAuth.js - يتحقق إنه الطلب جاي من جهاز عنده رمز تفعيل صالح (غير ملغى)
const { getDevice } = require("../db");

async function deviceAuth(req, res, next) {
  const token = req.header("X-Device-Token");

  if (!token) {
    return res.status(401).json({ error: "رمز التفعيل مفقود (X-Device-Token)" });
  }

  const device = await getDevice(token);

  if (!device) {
    return res.status(401).json({ error: "رمز التفعيل غير صالح" });
  }

  if (device.revoked) {
    return res.status(403).json({ error: "تم إلغاء تفعيل هذا الجهاز" });
  }

  req.device = device; // متاح للـ middlewares/routes اللاحقة
  next();
}

module.exports = deviceAuth;
