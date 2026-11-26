# DJ KRISS — Street Frequency · Pre-save

Landing page do lançamento (sexta 27/11, 00:00), feita para celular, com cena 3D em three.js
(a caixa d'água da Ceilândia à noite, palco, paredões, carros de som e multidão reagindo ao grave),
prévias de 30s das 12 faixas e mural de mensagens.

## Estrutura

```
index.html            página
css/style.css         visual (mobile first)
js/tracks.js          ORDEM, NOMES, CORES e link do pre-save  ← edite aqui
js/player.js          player das prévias (0:00 → 0:30, trava rígida)
js/scene.js           cena 3D (three.js)
js/mural.js           mural de mensagens (front)
server/server.js      servidor Node sem dependências: site + API do mural
deploy/               nginx, systemd e script de publicação
assets/covers/        capas quadradas   <slug>.webp (800x800)
assets/covers-h/      capas HORIZONTAIS <slug>.webp (1280x720)  ← provisórias, troque pelas oficiais
assets/audio/         prévias           <slug>-30s.mp3
```

### Trocar as capas horizontais

As capas em `assets/covers-h/` são **provisórias**: foram geradas a partir das quadradas
(fundo desfocado). Para usar as oficiais, salve cada uma em 16:9 com o mesmo nome:
`01-low-frequency.webp`, `02-smd-bitch.webp`, … `12-chicken-bass.webp`.

### Prévias

Cada arquivo em `assets/audio/` é um corte de 30s. O player sempre toca de 0:00 a 0:30
e para. Para refazer os cortes a partir das faixas completas (começando em 0s):

```bash
ffmpeg -i faixa-completa.wav -t 30 -af "afade=t=out:st=28:d=2" -b:a 160k assets/audio/01-low-frequency-30s.mp3
```

## Testar no computador

```bash
node server/server.js
```

Abra http://127.0.0.1:3077

## Publicar em djkriss-pre-save.auforria.com

1. No painel de DNS do domínio `auforria.com`, crie o registro
   **A `djkriss-pre-save` → `212.47.66.202`**.
2. No seu computador, dentro desta pasta:
   ```bash
   ./deploy/deploy.sh
   ```
   O script pede a senha do servidor, instala nginx, Node e HTTPS (Let's Encrypt),
   copia o site para `/var/www/djkriss-pre-save` e liga a API do mural.

## Moderar o mural

As mensagens ficam em `/var/lib/djkriss-pre-save/mensagens.json` no servidor.
O token de admin está em `/etc/djkriss-pre-save.env`.

```bash
# listar tudo (no servidor)
curl -s -H "X-Admin-Token: SEU_TOKEN" http://127.0.0.1:3077/api/admin/mensagens
# apagar uma mensagem
curl -s -X DELETE -H "X-Admin-Token: SEU_TOKEN" http://127.0.0.1:3077/api/mensagens/ID
```

Para exigir aprovação antes de publicar, adicione `MODERACAO=1` em `/etc/djkriss-pre-save.env`
e rode `systemctl restart djkriss-pre-save`. Para aprovar:

```bash
curl -s -X POST -H "X-Admin-Token: SEU_TOKEN" http://127.0.0.1:3077/api/mensagens/ID/aprovar
```
