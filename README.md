# Springou

Gerenciador de split de tráfego com otimização automática por receita.

Cadastra links de destino, expõe um endereço público de redirect e distribui
o tráfego entre esses links proporcionalmente ao que cada um rende — puxando
eCPM e receita direto do Google Ad Manager.

## Como funciona

```
Projeto → Splitter → Abas → Links
                       ↑
                     Rota pública (domínio + slug)
```

1. Um visitante acessa `https://seudominio.com/go/oferta-01`.
2. O servidor encontra a rota (domínio + slug) e lista os links ativos da aba.
3. Sorteia um link com peso proporcional à fatia de tráfego calculada.
4. Conta a visita, aplica as UTMs do link na URL de destino.
5. Devolve a página de loader (com Pixel do Facebook, se configurado), que
   redireciona o visitante para a oferta.

O Ad Manager alimenta o ciclo: a sincronização casa cada link com o relatório
pela `utm_campaign`, grava eCPM/impressões/receita e recalcula a distribuição.

### O algoritmo de distribuição

Em `src/shared/probability.js`. Manda mais tráfego para quem rende mais, sem
nunca parar de testar os outros:

| Parâmetro | Padrão | Efeito |
|---|---|---|
| `alpha` | 0.6 | Achata a vantagem do melhor link — o dobro de eCPM não vira o dobro de tráfego |
| `confidence` | 1000 impressões | eCPM medido em pouca impressão pesa menos |
| `epsilon` | 0.1 | 10% do tráfego sempre vai para exploração uniforme |
| `minProb` / `maxProb` | 5% / 55% | Piso e teto por link |

Piso e teto são aplicados com redistribuição iterativa, então a soma fecha
sempre em 100% sem estourar os limites.

## Stack

React 19 + Vite no frontend, Express 5 + Prisma + PostgreSQL no backend.
Autenticação por JWT com senha em hash bcrypt.

## Rodando localmente

Requisitos: Node 20+ e um PostgreSQL acessível.

```bash
npm install
cp .env.example .env
```

Preencha o `.env` — no mínimo `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL` e
`ADMIN_PASSWORD`. Para gerar o segredo:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Crie o schema e suba os dois processos:

```bash
npx prisma migrate dev --name init

npm run dev:server   # API   → http://localhost:3001
npm run dev:front    # painel → http://localhost:5173
```

O primeiro start cria o usuário admin a partir do `.env`. Depois de entrar,
troque a senha em **Configurações** e remova `ADMIN_PASSWORD` do arquivo.

Para conferir a API: `curl http://localhost:3001/api/health`

## Google Ad Manager

A integração roda com credenciais OAuth passadas por variável de ambiente —
nenhum arquivo de credencial fica no repositório:

- `GAM_OAUTH_JSON` — o JSON do client OAuth, em uma linha
- `GAM_TOKEN_JSON` — o JSON do token com o refresh_token

No painel, em **Ad Manager**, cadastre uma conexão com o *network code* e o
ID de um relatório salvo no GAM. O relatório precisa ter a dimensão
chave-valor (`utm_campaign=...`) e as métricas na ordem impressões, eCPM e
receita.

`ENABLE_GAM_SYNC=true` liga o cron (padrão: de hora em hora, via
`GAM_SYNC_CRON`). Sem isso, a sincronização só acontece pelo botão do painel.

## Estrutura

```
prisma/schema.prisma      modelos do banco
src/shared/               algoritmo de probabilidade (servidor + painel)
src/server/
  index.js                bootstrap do Express
  routes/                 endpoints REST + o redirect público /go/:slug
  services/               otimizador e sincronização do GAM
  gam/                    cliente e leitura de relatórios do Ad Manager
  auth/                   JWT, middleware e criação do primeiro admin
  views/                  HTML da página de loader
src/pages/                telas do painel
src/components/           modais e UI compartilhada
```

## API

Tudo sob `/api` exige `Authorization: Bearer <token>`, exceto
`/api/health` e `/api/auth/login`. O redirect `/go/:slug` é público.

| Método | Rota | O que faz |
|---|---|---|
| `POST` | `/api/auth/login` | Autentica e devolve o JWT |
| `POST` | `/api/auth/change-password` | Troca a senha do usuário logado |
| `GET/POST` | `/api/projects` | Lista e cria projetos |
| `GET/POST` | `/api/projects/:id/splitters` | Splitters do projeto |
| `GET/POST/PUT/DELETE` | `/api/splitters/:id/tabs` | Abas do splitter |
| `GET/POST` | `/api/splitters/:id/links` | Links da aba |
| `POST` | `/api/splitters/:id/optimize` | Recalcula a distribuição |
| `GET` | `/api/splitters/:id/preview` | Simula a distribuição sem gravar |
| `GET/POST` | `/api/splitters/:id/routes` | Rotas públicas do splitter |
| `GET/POST` | `/api/gam/connections` | Conexões do Ad Manager |
| `POST` | `/api/gam/sync/:id?` | Sincroniza uma conexão ou todas |
| `GET` | `/go/:slug` | Redirect público (sem autenticação) |

## Segurança

- `.env`, `credentials.json`, `token.json` e `*.db` estão no `.gitignore`.
  Segredo nenhum entra no repositório.
- Senhas ficam em hash bcrypt (custo 12); a API nunca devolve o hash.
- O `pixelId` da rota só aceita dígitos, e título/subtítulo do loader são
  escapados — a página de redirect não aceita HTML injetado.
- Links só aceitam URLs `http`/`https`.
