const { createHash, timingSafeEqual } = require("node:crypto");

function equal(a, b) {
  const left = createHash("sha256").update(String(a)).digest();
  const right = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(left, right);
}

module.exports = function adminAuth(req, res, next) {
  const expected = process.env.ADMIN_READ_TOKEN;
  if (!expected || Buffer.byteLength(expected) < 32) {
    return res.status(503).json({ error: "ADMIN_API_DISABLED" });
  }
  const header = String(req.get("authorization") || "");
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided || !equal(provided, expected)) {
    return res.status(401).json({ error: "ADMIN_AUTH_REQUIRED" });
  }
  next();
};
