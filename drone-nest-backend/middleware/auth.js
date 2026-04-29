const jwt = require('jsonwebtoken')
const { getJwtSecret } = require('../config/env')

const JWT_SECRET = getJwtSecret()

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未登录或token已过期', data: null })
  }

  const token = authHeader.slice(7)
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch (err) {
    return res.status(401).json({ code: 401, message: '无效的token', data: null })
  }
}

const hasRole = (user, roles) => roles.includes(user?.role)

const requireRole = (...roles) => (req, res, next) => {
  if (!hasRole(req.user, roles)) {
    return res.status(403).json({ code: 403, message: '没有权限访问', data: null })
  }
  next()
}

const requireSelfOrRole = (paramName, ...roles) => (req, res, next) => {
  if (hasRole(req.user, roles) || String(req.user?.id) === String(req.params[paramName])) {
    return next()
  }
  return res.status(403).json({ code: 403, message: '没有权限访问', data: null })
}

module.exports = authenticate
module.exports.authenticate = authenticate
module.exports.requireRole = requireRole
module.exports.requireSelfOrRole = requireSelfOrRole
module.exports.JWT_SECRET = JWT_SECRET
