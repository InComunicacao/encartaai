import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em desenvolvimento, /api vai para o `wrangler dev` (porta 8787).
// Em produção, o mesmo Worker serve a API e estes arquivos: mesma origem,
// cookie simples, sem CORS.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
