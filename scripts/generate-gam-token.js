/**
 * Gera um token OAuth novo para o Google Ad Manager.
 *
 *   node scripts/generate-gam-token.js
 *
 * Abre um servidor local temporário, te dá um link para autorizar no
 * navegador e grava o resultado em GAM_TOKEN_JSON no `.env`. O client_id e
 * o client_secret (GAM_OAUTH_JSON) continuam os mesmos — eles não expiram.
 *
 * Use quando a sincronização falhar com `invalid_grant`, que é o Google
 * dizendo que o refresh token não vale mais.
 */
import "dotenv/config";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { OAuth2Client } from "google-auth-library";

const SCOPE = "https://www.googleapis.com/auth/admanager";
const CALLBACK_PORT = 53682;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}`;

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function loadOAuthConfig() {
  const raw = process.env.GAM_OAUTH_JSON;

  if (raw && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch {
      fail("GAM_OAUTH_JSON no .env não é um JSON válido");
    }
  }

  // Sem a variável, aceita um oauth.json solto na pasta atual.
  if (fs.existsSync("oauth.json")) {
    try {
      return JSON.parse(fs.readFileSync("oauth.json", "utf8"));
    } catch {
      fail("oauth.json não é um JSON válido");
    }
  }

  fail(
    "Não achei as credenciais OAuth.\n" +
      "   Preencha GAM_OAUTH_JSON no .env ou deixe um oauth.json nesta pasta."
  );
}

function setEnvValue(content, key, value) {
  const line = `${key}='${value}'`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(content)) return content.replace(pattern, line);
  return `${content.trimEnd()}\n${line}\n`;
}

function reply(res, status, title, message) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><meta charset="utf-8">` +
      `<body style="font-family:system-ui;background:#0b1120;color:#e8edf7;` +
      `display:grid;place-items:center;height:100vh;margin:0;text-align:center">` +
      `<div><h1 style="font-size:20px">${title}</h1>` +
      `<p style="opacity:.7">${message}</p></div>`
  );
}

/** Espera o Google redirecionar de volta com o código de autorização. */
function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);

      if (url.pathname !== "/") {
        res.writeHead(404).end();
        return;
      }

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        reply(res, 400, "Autorização recusada", `O Google devolveu: ${error}`);
        server.close();
        reject(new Error(`autorização recusada: ${error}`));
        return;
      }

      if (!code) {
        reply(res, 400, "Faltou o código", "Tente abrir o link de novo.");
        return;
      }

      reply(
        res,
        200,
        "✅ Autorizado",
        "Pode fechar esta aba e voltar para o terminal."
      );

      server.close();
      resolve(code);
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            `a porta ${CALLBACK_PORT} está ocupada. Feche o que estiver usando e rode de novo.`
          )
        );
        return;
      }
      reject(error);
    });

    server.listen(CALLBACK_PORT);
  });
}

const credentials = loadOAuthConfig();
const config = credentials.installed || credentials.web || credentials;

if (!config.client_id || !config.client_secret) {
  fail("As credenciais OAuth não têm client_id/client_secret");
}

const client = new OAuth2Client(
  config.client_id,
  config.client_secret,
  REDIRECT_URI
);

const authUrl = client.generateAuthUrl({
  access_type: "offline",
  // Sem forçar o consentimento o Google devolve só o access_token quando
  // já existe uma autorização — e aí não vem refresh_token nenhum.
  prompt: "consent",
  scope: [SCOPE],
});

console.log("\n🔗 Abra este link no navegador e autorize:\n");
console.log(authUrl);
console.log("\n⏳ Esperando você autorizar...\n");

let tokens;

try {
  const code = await waitForCode();
  ({ tokens } = await client.getToken(code));
} catch (error) {
  fail(`Falhou: ${error.message}`);
}

if (!tokens?.refresh_token) {
  fail(
    "O Google não devolveu refresh_token.\n" +
      "   Revogue o acesso do app em https://myaccount.google.com/permissions\n" +
      "   e rode este script de novo."
  );
}

const envPath = path.resolve(".env");

if (!fs.existsSync(envPath)) {
  fail("Não achei o .env nesta pasta. Rode o script de dentro do projeto.");
}

let content = fs.readFileSync(envPath, "utf8");
content = setEnvValue(content, "GAM_TOKEN_JSON", JSON.stringify(tokens));

// Guarda também o client OAuth, caso tenha vindo de um oauth.json solto.
if (!process.env.GAM_OAUTH_JSON?.trim()) {
  content = setEnvValue(content, "GAM_OAUTH_JSON", JSON.stringify(credentials));
}

fs.writeFileSync(envPath, content);

console.log("✅ Token novo gravado no .env\n");
console.log(`   escopo        ${tokens.scope || SCOPE}`);
console.log(`   refresh_token obtido`);
console.log(
  `   expira em     ${new Date(tokens.expiry_date).toLocaleString("pt-BR")} (renova sozinho)\n`
);
console.log("   Reinicie o servidor e sincronize de novo pelo painel.\n");
