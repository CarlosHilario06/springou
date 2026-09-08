# Deploy

Guia para colocar o Springou no ar num servidor próprio, de graça, usando o
nível **Always Free** da Oracle Cloud. Todo o sistema roda em um único
servidor: aplicação, banco e HTTPS.

Por que num servidor só: o redirect faz três consultas ao banco por acesso.
Com o banco na mesma máquina isso custa ~1ms; com o banco em outro
continente, ~300ms — e a capacidade cai de ~1.200 para ~29 acessos por
segundo. Manter os dois juntos é a decisão que mais importa.

## 1. Criar o servidor

Em [cloud.oracle.com](https://cloud.oracle.com), crie a conta. O cartão é
usado só para verificação de identidade; a conta fica como *Always Free* e
não é cobrada.

Escolha uma região da Europa (Frankfurt ou Amsterdã) — a região **não pode
ser trocada depois**.

Em **Compute → Instances → Create instance**:

| Campo | Valor |
|---|---|
| Image | Ubuntu 24.04 |
| Shape | **Ampere (ARM)** — `VM.Standard.A1.Flex` |
| OCPUs / memória | 4 / 24 GB (o teto do plano gratuito) |
| SSH keys | gere e **guarde a chave privada** |

> Se aparecer "out of capacity", é o estoque de máquinas ARM gratuitas da
> região. Tente de novo mais tarde ou escolha a outra cidade europeia.

Anote o **IP público** da instância.

## 2. Abrir as portas

Duas camadas de firewall precisam liberar 80 e 443.

**Na Oracle:** *Networking → Virtual Cloud Networks →* sua VCN *→ Security
Lists → Default →* **Add Ingress Rules**, duas regras com origem
`0.0.0.0/0`, protocolo TCP, portas 80 e 443.

**No Ubuntu**, depois de conectar por SSH:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 3. Instalar o Docker

```bash
ssh -i sua-chave.key ubuntu@SEU_IP

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
```

Entre de novo por SSH para o grupo valer.

## 4. Apontar o domínio

No seu provedor de DNS (o [Cloudflare](https://cloudflare.com) é gratuito e
serve bem), crie um registro **A** apontando para o IP do servidor:

```
Tipo  Nome    Conteúdo        Proxy
A     split   SEU_IP          desligado (nuvem cinza)
```

Deixe o proxy **desligado** no primeiro deploy: o Caddy precisa falar direto
com a Let's Encrypt para emitir o certificado. Depois de o HTTPS funcionar,
você pode ligar se quiser.

Confirme antes de seguir — o DNS pode levar alguns minutos:

```bash
dig +short split.seudominio.com
```

## 5. Subir a aplicação

```bash
git clone https://github.com/CarlosHilario06/springou.git
cd springou
cp .env.example .env
nano .env
```

Preencha:

```ini
DOMAIN="split.seudominio.com"
POSTGRES_PASSWORD="<gere uma senha forte>"
JWT_SECRET="<gere um segredo de 48 bytes>"
ADMIN_EMAIL="voce@exemplo.com"
ADMIN_PASSWORD="<sua senha de acesso ao painel>"
```

Para gerar os valores aleatórios:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Suba tudo:

```bash
docker compose up -d --build
```

O primeiro build leva alguns minutos. As migrations rodam sozinhas antes de
a aplicação iniciar, e o Caddy emite o certificado no primeiro acesso.

Confira:

```bash
curl https://split.seudominio.com/api/health
docker compose logs -f app
```

Abra `https://split.seudominio.com` e entre com o e-mail e senha do `.env`.
Depois **troque a senha pelo painel** e remova `ADMIN_PASSWORD` do arquivo.

## 6. Ad Manager

As credenciais do Google vão no mesmo `.env`, em uma linha cada:

```ini
GAM_OAUTH_JSON='{"installed":{...}}'
GAM_TOKEN_JSON='{"refresh_token":"...","scope":"..."}'
ENABLE_GAM_SYNC="true"
```

Se o token expirar (`invalid_grant`), gere outro na sua máquina com
`node scripts/generate-gam-token.js` e copie o valor para o `.env` do
servidor. Depois:

```bash
docker compose up -d
```

## Operação

```bash
# atualizar para a última versão
git pull && docker compose up -d --build

# ver o que está acontecendo
docker compose logs -f app
docker compose ps

# reiniciar só a aplicação
docker compose restart app

# backup do banco
docker compose exec db pg_dump -U springou springou > backup-$(date +%F).sql

# restaurar
cat backup-2026-09-08.sql | docker compose exec -T db psql -U springou springou
```

Faça o backup com alguma regularidade: o histórico de eCPM e receita dos
links não existe em nenhum outro lugar.

## Capacidade

Medido neste projeto, com o banco na mesma máquina:

| Concorrência | Acessos por segundo | p95 |
|---|---|---|
| 10 | 839 | 20ms |
| 50 | 1.050 | 66ms |
| 100 | 1.209 | 114ms |

500 mil acessos por dia dão ~6 por segundo de média. Mesmo um disparo em
massa que traga 50 mil pessoas em 15 minutos fica em ~55 por segundo — bem
dentro do que uma instância aguenta.

Se um dia isso apertar, o caminho é tirar o banco da rota crítica: guardar
rotas e links em memória e acumular as visitas para gravar em lote. Com
isso o redirect deixa de consultar o banco por acesso.
