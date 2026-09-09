import fs from "node:fs";
import { JWT, OAuth2Client } from "google-auth-library";
import { env } from "../env.js";

/** Escopo único da API do Ad Manager. */
const GAM_SCOPE = "https://www.googleapis.com/auth/admanager";

let cachedAuth = null;

function parseJsonEnv(raw, name) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${name} não é um JSON válido`);
  }
}

/** A chave da conta de serviço, vinda do ambiente ou de um arquivo. */
function readServiceAccountKey() {
  if (env.gam.serviceAccountJson) {
    return parseJsonEnv(env.gam.serviceAccountJson, "GAM_SERVICE_ACCOUNT_JSON");
  }

  if (!env.gam.serviceAccountFile) return null;

  let conteudo;

  try {
    conteudo = fs.readFileSync(env.gam.serviceAccountFile, "utf8");
  } catch {
    throw new Error(
      `Não consegui ler ${env.gam.serviceAccountFile} (GAM_SERVICE_ACCOUNT_FILE)`
    );
  }

  return parseJsonEnv(conteudo, "GAM_SERVICE_ACCOUNT_FILE");
}

/** Cliente OAuth2 de usuário — o modo antigo, uma conta Google por vez. */
function buildUserAuth() {
  const credentials = parseJsonEnv(env.gam.oauthJson, "GAM_OAUTH_JSON");
  const token = parseJsonEnv(env.gam.tokenJson, "GAM_TOKEN_JSON");

  const config = credentials.installed || credentials.web || credentials;
  const { client_id: clientId, client_secret: clientSecret } = config;
  const redirectUri = config.redirect_uris?.[0] || "http://localhost";

  if (!clientId || !clientSecret) {
    throw new Error("GAM_OAUTH_JSON não contém client_id/client_secret");
  }

  const auth = new OAuth2Client(clientId, clientSecret, redirectUri);
  auth.setCredentials(token);

  return auth;
}

/**
 * Credencial usada para falar com o Ad Manager.
 *
 * A conta de serviço vem primeiro: uma chave só atende todas as redes em
 * que ela foi cadastrada como usuário, então dá para ter várias conexões
 * de networkCode diferente sem trocar credencial. Sem ela, cai no OAuth de
 * usuário, que vale para uma conta Google por vez.
 *
 * Nada de credencial dentro do repositório — ou variável de ambiente, ou
 * um arquivo montado de fora.
 */
export function getGoogleAuth() {
  if (cachedAuth) return cachedAuth;

  const key = readServiceAccountKey();

  if (key) {
    if (!key.client_email || !key.private_key) {
      throw new Error(
        "A chave da conta de serviço não tem client_email/private_key"
      );
    }

    cachedAuth = new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: [GAM_SCOPE],
    });

    return cachedAuth;
  }

  if (!env.gam.oauthJson || !env.gam.tokenJson) {
    throw new Error(
      "Credenciais do GAM ausentes. Defina GAM_SERVICE_ACCOUNT_JSON (conta de serviço) ou GAM_OAUTH_JSON e GAM_TOKEN_JSON no .env"
    );
  }

  cachedAuth = buildUserAuth();
  return cachedAuth;
}

/** Qual credencial está valendo — o painel mostra isso. */
export function gamAuthMode() {
  if (env.gam.serviceAccountJson || env.gam.serviceAccountFile) {
    return "service_account";
  }

  if (env.gam.oauthJson && env.gam.tokenJson) return "oauth";

  return null;
}

/** E-mail da conta de serviço — é ele que precisa ser cadastrado no GAM. */
export function gamServiceAccountEmail() {
  try {
    return readServiceAccountKey()?.client_email ?? null;
  } catch {
    return null;
  }
}

export function isGamConfigured() {
  return gamAuthMode() !== null;
}
