function checkCredentials(password) {
  const validPassword = process.env.ADMIN_PASSWORD || "";
  if (!validPassword) return false;
  return password === validPassword;
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect("/admin/login");
}

module.exports = { checkCredentials, requireAdmin };
