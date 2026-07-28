const bcrypt = require("bcryptjs");

function checkCredentials(username, password) {
  const validUser = process.env.ADMIN_USERNAME || "";
  const validHash = process.env.ADMIN_PASSWORD_HASH || "";
  if (!validUser || !validHash) return false;
  if (username !== validUser) return false;
  return bcrypt.compareSync(password, validHash);
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect("/admin/login");
}

module.exports = { checkCredentials, requireAdmin };
