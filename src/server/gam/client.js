import { google } from "googleapis";
import { env } from "../env.js";

let cachedAuth = null;

function parseJsonEnv(raw, name) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${name} não é um JSON válido`);
  }
}

/**
 * Cliente OAuth2 do Google, montado a partir das credenciais em ambiente.
 * Nada de ler arquivo de credencial do disco — segredo não mora no repo.
 */
export function getGoogleAuth() {
  if (cachedAuth) return cachedAuth;

  if (!env.gam.oauthJson || !env.gam.tokenJson) {
    throw new Error(
      "Credenciais do GAM ausentes. Defina GAM_OAUTH_JSON e GAM_TOKEN_JSON no .env"
    );
  }

  const credentials = parseJsonEnv(env.gam.oauthJson, "GAM_OAUTH_JSON");
  const token = parseJsonEnv(env.gam.tokenJson, "GAM_TOKEN_JSON");

  const config = credentials.installed || credentials.web || credentials;
  const { client_id: clientId, client_secret: clientSecret } = config;
  const redirectUri = config.redirect_uris?.[0] || "http://localhost";

  if (!clientId || !clientSecret) {
    throw new Error("GAM_OAUTH_JSON não contém client_id/client_secret");
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  auth.setCredentials(token);

  cachedAuth = auth;
  return cachedAuth;
}

export function isGamConfigured() {
  return Boolean(env.gam.oauthJson && env.gam.tokenJson);
}
