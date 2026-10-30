# EncartaAi 3.0

Plataforma SaaS whitelabel de encartes, vídeos para LED, redes sociais e impressão.
Especificação: documento "Gerador de Encartes 3.0 + IA — Especificação".

## Estrutura

```
apps/api      API — Cloudflare Workers + Hono + D1
  migrations/ esquema do banco (D1)
  src/lib/    senha (PBKDF2), sessão (acesso único), módulos por plano
  test/       testes num Worker real (vitest + workerd)
```

## Rodar os testes

```
cd apps/api
npm install --legacy-peer-deps
npm test
```

## Publicar (primeira vez)

```
npx wrangler d1 create encartaai          # copie o database_id para wrangler.toml
npx wrangler d1 migrations apply encartaai --remote
npx wrangler secret put SETUP_TOKEN        # 16+ caracteres; usado uma vez em POST /api/setup
npx wrangler deploy
```

## Telas (apps/web)

React + Vite. Em produção, o mesmo Worker da API serve as telas (`[assets]` no wrangler.toml).

```
cd apps/web && npm install --legacy-peer-deps && npm run build
cd ../api && npx wrangler dev          # API + telas em http://127.0.0.1:8787
```

Teste de ponta a ponta pelas telas (Playwright): `node apps/web/e2e/fluxo.cjs`

## Motor de render (packages/render)

Desenha qualquer saída a partir de dados (campanha + kit da marca + templates), no navegador e em Node.
Grades e estilos medidos na v2 (`test/geometria_v2.json` → `src/medidas-v2.json`).

```
cd packages/render && npm install && npm test
# com as fontes do cliente (não versionadas) e PNGs de saída:
FONTES_GOTHAM=/caminho/fontes SAIDA_RENDER=/tmp/render npm test
```
