const isProduction = process.env.NODE_ENV === 'production'

const requireEnv = (name, fallback = undefined) => {
  const value = process.env[name]
  if (value !== undefined && value !== '') {
    return value
  }
  if (fallback !== undefined && !isProduction) {
    return fallback
  }
  throw new Error(`Missing required environment variable: ${name}`)
}

const getJwtSecret = () => {
  const secret = requireEnv('JWT_SECRET', 'dev_only_change_me_jwt_secret')
  if (isProduction && secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production')
  }
  return secret
}

const getAllowedOrigins = () => {
  const configured = process.env.ALLOWED_ORIGINS
  if (configured) {
    return configured.split(',').map(origin => origin.trim()).filter(Boolean)
  }
  if (isProduction) {
    throw new Error('Missing required environment variable: ALLOWED_ORIGINS')
  }
  return ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174', 'http://localhost:5175', 'http://127.0.0.1:5175', 'http://localhost:8080', 'http://127.0.0.1:8080']
}

module.exports = {
  isProduction,
  requireEnv,
  getJwtSecret,
  getAllowedOrigins
}
