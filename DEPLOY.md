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

A região escolhida no cadastro (*home region*) **não pode ser trocada
depois**, e os recursos gratuitos só existem nela.

Escolha a região mais próxima de onde vem o grosso do seu tráfego. Mas se
você já escolheu outra, não recomece a conta: o impacto é menor do que
parece.

O que a região **não** afeta é a capacidade. As três consultas por redirect
falam com um Postgres na mesma máquina, custando ~1ms independentemente de
onde o servidor esteja — os ~1.200 acessos/s medidos valem igual em São
Paulo ou em Frankfurt.

O que ela afeta é a latência de rede até o visitante. Um europeu acessando
um servidor no Brasil paga uns 200ms a mais, que viram ~400ms até o primeiro
byte por causa do aperto de mão do TLS. Como a página de carregamento já
espera 1,2s antes de redirecionar, o visitante percebe pouco.

E dá para recuperar boa parte disso de graça: com o proxy do Cloudflare
ligado (passo 4), o TLS é negociado numa borda perto do visitante e a
conexão até o servidor fica reaproveitada, cortando a maior parte do custo
do aperto de mão.

> Curiosidade útil: Frankfurt e Amsterdã são as regiões mais concorridas
> para as máquinas ARM gratuitas, e frequentemente aparecem sem estoque.
> Regiões menos disputadas costumam liberar a instância de primeira.

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

## 2b. Máquina pequena (1 GB de RAM)

Pule esta seção se sua instância tem 6 GB ou mais.

As máquinas ARM gratuitas vivem esgotadas nas regiões concorridas. A saída é
a outra opção do plano gratuito, a `VM.Standard.E2.1.Micro` (AMD, 1 núcleo,
1 GB), que quase sempre tem estoque.

Ela **roda** o sistema sem problema — a aplicação, o Postgres e o Caddy
juntos ficam em torno de 400 MB. O que não cabe em 1 GB é o **build** do
painel, que é o pico de memória de toda a operação.

Resolve-se com um arquivo de swap. Antes do `docker compose up`:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Confira com `free -h` — deve aparecer 4 GB em *Swap*.

O build fica mais lento (uns 5 a 10 minutos em vez de 2), mas passa. Depois
de no ar, o swap quase não é tocado: o consumo em regime cabe na memória
real.

Se ainda assim o build falhar por memória, limite o Node durante ele:

```bash
NODE_OPTIONS=--max-old-space-size=512 docker compose build
docker compose up -d
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
com a Let's Encrypt para emitir o certificado.

Depois que o HTTPS estiver funcionando, **ligue o proxy** (nuvem laranja).
Além de esconder o IP do servidor, ele termina o TLS perto do visitante — o
que compensa boa parte da latência quando o servidor está longe do público.

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

As credenciais do Google vão no mesmo `.env`, em uma linha cada.

Com **conta de serviço** (uma chave para todas as redes):

```ini
GAM_SERVICE_ACCOUNT_JSON='{"type":"service_account","client_email":"...","private_key":"..."}'
ENABLE_GAM_SYNC="true"
```

Para gerar essa linha sem errar no copia-e-cola, mande a chave para o
servidor e deixe o script escrever:

```bash
scp conta-servico.json ubuntu@SEU_IP:~/conta-servico.json
ssh ubuntu@SEU_IP
cd ~/springou && node scripts/import-gam-service-account.js ~/conta-servico.json
rm ~/conta-servico.json          # a chave já está no .env
```

Com **OAuth de usuário** (uma conta Google por vez):

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
