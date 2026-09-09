import "dotenv/config";

function required(name) {
  const value = process.env[name];

  if (!value || !String(value).trim()) {
    console.error(`❌ Variável de ambiente obrigatória ausente: ${name}`);
    console.error("   Copie .env.example para .env e preencha os valores.");
    process.exit(1);
  }

  return String(value).trim();
}

function optional(name, fallback = "") {
  const value = process.env[name];
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function bool(name, fallback = false) {
  const value = optional(name);
  if (!value) return fallback;
  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
}

const isProduction = optional("NODE_ENV", "development") === "production";

const jwtSecret = required("JWT_SECRET");

if (jwtSecret.length < 32) {
  console.error("❌ JWT_SECRET curto demais (mínimo 32 caracteres).");
  console.error(
    '   Gere um: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
  process.exit(1);
}

export const env = {
  isProduction,
  port: Number(optional("PORT", "3001")),
  databaseUrl: required("DATABASE_URL"),

  jwtSecret,
  jwtExpiresIn: optional("JWT_EXPIRES_IN", "12h"),

  adminEmail: optional("ADMIN_EMAIL"),
  adminPassword: optional("ADMIN_PASSWORD"),

  corsOrigins: optional(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),

  gam: {
    // Ligado por padrão: só roda de fato quando há credenciais do GAM, e
    // é o que mantém eCPM e receita frescos de hora em hora.
    syncEnabled: bool("ENABLE_GAM_SYNC", true),
    syncCron: optional("GAM_SYNC_CRON", "0 * * * *"),
    // Conta de serviço: uma chave só, válida para todas as redes em que ela
    // foi cadastrada como usuário. Tem prioridade sobre o OAuth abaixo.
    serviceAccountJson: optional("GAM_SERVICE_ACCOUNT_JSON"),
    serviceAccountFile: optional("GAM_SERVICE_ACCOUNT_FILE"),
    // OAuth de usuário: o jeito antigo, uma conta Google por vez.
    oauthJson: optional("GAM_OAUTH_JSON"),
    tokenJson: optional("GAM_TOKEN_JSON"),
    networkCode: optional("GAM_NETWORK_CODE"),
    reportId: optional("GAM_REPORT_ID"),
  },

  defaultPixelId: optional("FB_PIXEL_ID"),
};
