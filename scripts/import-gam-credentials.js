/**
 * Importa as credenciais do Google Ad Manager de uma instalação antiga
 * do projeto para o `.env` atual.
 *
 *   node scripts/import-gam-credentials.js <pasta-do-projeto-antigo>
 *
 * Lê `oauth.json` e `token.json`, valida o conteúdo e reescreve as linhas
 * GAM_OAUTH_JSON e GAM_TOKEN_JSON. Os valores nunca são impressos na tela
 * — só um resumo do que foi encontrado.
 */
import fs from "node:fs";
import path from "node:path";

const AD_MANAGER_SCOPE = "https://www.googleapis.com/auth/admanager";

// Onde esses arquivos costumavam ficar no projeto antigo.
const SEARCH_DIRS = [".", "src/server/gam", "server/gam", "gam"];

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function findFile(root, name) {
  for (const dir of SEARCH_DIRS) {
    const candidate = path.join(root, dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${file} não é um JSON válido: ${error.message}`);
  }
}

/** Reescreve uma chave do .env preservando todo o resto do arquivo. */
function setEnvValue(content, key, value) {
  const line = `${key}='${value}'`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(content)) return content.replace(pattern, line);
  return `${content.trimEnd()}\n${line}\n`;
}

const sourceRoot = process.argv[2];

if (!sourceRoot) {
  fail(
    "Informe a pasta do projeto antigo.\n" +
      "   Exemplo: node scripts/import-gam-credentials.js D:\\\\split2-antigo"
  );
}

if (!fs.existsSync(sourceRoot)) {
  fail(`Pasta não encontrada: ${sourceRoot}`);
}

const oauthFile = findFile(sourceRoot, "oauth.json");
const tokenFile = findFile(sourceRoot, "token.json");

if (!oauthFile) fail(`Não achei oauth.json dentro de ${sourceRoot}`);
if (!tokenFile) fail(`Não achei token.json dentro de ${sourceRoot}`);

const oauth = readJson(oauthFile);
const token = readJson(tokenFile);

const client = oauth.installed || oauth.web || oauth;

if (!client.client_id || !client.client_secret) {
  fail(`${oauthFile} não tem client_id/client_secret`);
}

// Sem refresh_token o acesso morre junto com o access_token, em uma hora.
if (!token.refresh_token) {
  fail(
    `${tokenFile} não tem refresh_token.\n` +
      "   Sem ele o acesso expira em ~1h e não se renova. Gere um token novo."
  );
}

if (token.scope && !token.scope.includes(AD_MANAGER_SCOPE)) {
  console.warn(
    `\n⚠️  O escopo do token é "${token.scope}",\n` +
      `   e não ${AD_MANAGER_SCOPE}.\n` +
      "   A sincronização provavelmente vai ser recusada pelo Google."
  );
}

const envPath = path.resolve(".env");

if (!fs.existsSync(envPath)) {
  fail("Não achei o .env nesta pasta. Rode o script de dentro de D:\\springou");
}

let content = fs.readFileSync(envPath, "utf8");
content = setEnvValue(content, "GAM_OAUTH_JSON", JSON.stringify(oauth));
content = setEnvValue(content, "GAM_TOKEN_JSON", JSON.stringify(token));
fs.writeFileSync(envPath, content);

const expired = token.expiry_date && token.expiry_date < Date.now();

console.log("\n✅ Credenciais importadas para o .env\n");
console.log(`   oauth.json  ${oauthFile}`);
console.log(`   token.json  ${tokenFile}`);
console.log(`   projeto     ${client.project_id || "(não informado)"}`);
console.log(`   escopo      ${token.scope || "(não informado)"}`);
console.log(
  `   access_token ${expired ? "vencido — será renovado pelo refresh_token" : "válido"}`
);
console.log("\n   Reinicie o servidor para as novas variáveis valerem.\n");
