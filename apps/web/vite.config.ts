import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Em desenvolvimento, /api vai para o `wrangler dev` (porta 8787).
// Em produção, o mesmo Worker serve a API e estes arquivos: mesma origem,
// cookie simples, sem CORS.
export default defineConfig({
  plugins: [react()],
  // O motor de render é código-fonte compartilhado (packages/render): o
  // mesmo arquivo desenha a prévia aqui e os testes em Node.
  resolve: { alias: { '@encartaai/render': fileURLToPath(new URL('../../packages/render/src/index.ts', import.meta.url)) } },
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
