#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Publica o pre-save em djkriss-pre-save.auforria.com
#  Rode NO SEU COMPUTADOR, dentro da pasta do projeto:
#     ./deploy/deploy.sh
#  O ssh vai pedir a senha do servidor (ela não fica salva em lugar nenhum).
#  Antes: aponte o DNS  djkriss-pre-save.auforria.com  →  A  212.47.66.202
# ─────────────────────────────────────────────────────────────
set -euo pipefail
SERVER="${SERVER:-root@212.47.66.202}"
DOMAIN="djkriss-pre-save.auforria.com"
APP=/var/www/djkriss-pre-save
cd "$(dirname "$0")/.."

echo "→ Empacotando o site…"
TMP=$(mktemp -d)
tar --exclude=.git --exclude='server/data' -czf "$TMP/site.tgz" .

echo "→ Enviando para $SERVER…"
scp "$TMP/site.tgz" "$SERVER:/tmp/djkriss-site.tgz"

echo "→ Instalando no servidor…"
ssh "$SERVER" DOMAIN="$DOMAIN" APP="$APP" 'bash -s' <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
command -v nginx >/dev/null || { apt-get update -y && apt-get install -y nginx; }
command -v node  >/dev/null || { apt-get update -y && apt-get install -y nodejs; }
command -v certbot >/dev/null || apt-get install -y certbot python3-certbot-nginx

mkdir -p "$APP" /var/lib/djkriss-pre-save
tar -xzf /tmp/djkriss-site.tgz -C "$APP"
rm -f /tmp/djkriss-site.tgz
chown -R www-data:www-data /var/lib/djkriss-pre-save

# token de admin do mural (gerado uma vez)
[ -f /etc/djkriss-pre-save.env ] || { echo "ADMIN_TOKEN=$(openssl rand -hex 16)" > /etc/djkriss-pre-save.env; chmod 600 /etc/djkriss-pre-save.env; }

cp "$APP/deploy/nginx-djkriss-pre-save.conf" /etc/nginx/sites-available/djkriss-pre-save.conf
ln -sf /etc/nginx/sites-available/djkriss-pre-save.conf /etc/nginx/sites-enabled/djkriss-pre-save.conf
cp "$APP/deploy/djkriss-pre-save.service" /etc/systemd/system/djkriss-pre-save.service
systemctl daemon-reload
systemctl enable --now djkriss-pre-save
systemctl restart djkriss-pre-save
nginx -t && systemctl reload nginx

# HTTPS (Let's Encrypt) — só funciona com o DNS já apontado
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || \
  echo "⚠  HTTPS não configurado ainda (DNS apontado?). Rode depois: certbot --nginx -d $DOMAIN"

curl -fsS http://127.0.0.1:3077/api/mensagens >/dev/null && echo "✓ API do mural no ar"
echo "✓ Publicado em https://$DOMAIN"
REMOTE
rm -rf "$TMP"
