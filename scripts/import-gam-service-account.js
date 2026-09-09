/**
 * Passa o painel a usar uma conta de serviço do Google no lugar do OAuth
 * de usuário.
 *
 *   node scripts/import-gam-service-account.js <chave.json>
 *
 * Uma conta de serviço vale para todas as redes do Ad Manager em que ela
 * estiver cadastrada como usuário — é o que permite ter várias conexões,
 * de network codes diferentes, sem trocar credencial.
 *
 * O conteúdo da chave nunca é impresso: só o e-mail, que é justamente o
 * que precisa ser cadastrado no GAM.
 */
import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

/** Reescreve uma chave do .env preservando todo o resto do arquivo. */
function setEnvValue(content, key, value) {
  const line = `${key}='${value}'`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(content)) return content.replace(pattern, line);
  return `${content.trimEnd()}\n${line}\n`;
}

const keyPath = process.argv[2];

if (!keyPath) {
  fail(
    "Informe o arquivo JSON da conta de serviço.\n" +
      "   Exemplo: node scripts/import-gam-service-account.js ~/conta-servico.json"
  );
}

if (!fs.existsSync(keyPath)) fail(`Arquivo não encontrado: ${keyPath}`);

let key;

try {
  key = JSON.parse(fs.readFileSync(keyPath, "utf8"));
} catch (error) {
  fail(`${keyPath} não é um JSON válido: ${error.message}`);
}

if (key.type !== "service_account") {
  fail(
    `${keyPath} não é a chave de uma conta de serviço (type: ${key.type || "ausente"}).\n` +
      "   Baixe em IAM e administrador → Contas de serviço → Chaves → Adicionar chave."
  );
}

if (!key.client_email || !key.private_key) {
  fail(`${keyPath} não tem client_email/private_key`);
}

const envPath = path.resolve(".env");

if (!fs.existsSync(envPath)) {
  fail("Não achei o .env nesta pasta. Rode o script de dentro da pasta do projeto.");
}

let content = fs.readFileSync(envPath, "utf8");
content = setEnvValue(content, "GAM_SERVICE_ACCOUNT_JSON", JSON.stringify(key));
fs.writeFileSync(envPath, content);

const tinhaOauth = /^GAM_OAUTH_JSON=.+$/m.test(content);

console.log("\n✅ Conta de serviço gravada no .env\n");
console.log(`   projeto  ${key.project_id || "(não informado)"}`);
console.log(`   e-mail   ${key.client_email}`);

if (tinhaOauth) {
  console.log(
    "\n   As credenciais OAuth antigas continuam no .env, mas não são mais\n" +
      "   usadas: a conta de serviço tem prioridade."
  );
}

console.log(
  "\n   Falta cadastrar esse e-mail em CADA rede do Ad Manager:\n" +
    "   Admin → Acesso e autorização → Contas de serviço → Adicionar,\n" +
    "   com uma função que permita executar relatórios.\n"
);
console.log("   Depois reinicie o servidor para a nova credencial valer.\n");
