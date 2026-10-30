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
