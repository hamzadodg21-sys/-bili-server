// adminAuth.js - يحمي نقاط /admin بسر منفصل تماماً عن رموز تفعيل الأجهزة
function adminAuth(req, res, next) {
  const secret = req.header("X-Admin-Secret");

  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "غير مصرح - X-Admin-Secret غير صحيح" });
  }

  next();
}

module.exports = adminAuth;
