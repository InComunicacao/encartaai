// Peças comuns a todas as rotas: tipos, respostas de erro e os guardas
// (sessão, papel, cliente, módulo). Ver as três regras em index.ts.

import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { COOKIE_SESSAO, lerSessao, type SessaoValida } from './lib/sessao';
import { modulosDoTenant } from './lib/modulos';

export interface Env {
  DB: D1Database;
  ARQUIVOS: R2Bucket;
  SETUP_TOKEN?: string;
}
export type Vars = { sessao: SessaoValida };
export type AppEnv = { Bindings: Env; Variables: Vars };
export type C = Context<AppEnv>;

export const agora = () => Date.now();
export const novoId = () => crypto.randomUUID();
export const erro = (c: C, status: number, codigo: string, mensagem: string, extra: Record<string, unknown> = {}) =>
  c.json({ erro: codigo, mensagem, ...extra }, status as any);

export async function lerJson<T>(c: C): Promise<T | null> {
  try { return await c.req.json<T>(); } catch { return null; }
}

export async function auditar(db: D1Database, s: SessaoValida | null, tenantId: string | null, acao: string, detalhe: unknown) {
  await db.prepare('INSERT INTO auditoria (id, tenant_id, usuario_id, acao, detalhe, criado_em) VALUES (?,?,?,?,?,?)')
    .bind(novoId(), tenantId, s ? s.usuarioId : null, acao, JSON.stringify(detalhe ?? {}), agora()).run();
}

export async function autenticar(c: C, next: Next) {
  const r = await lerSessao(c.env.DB, getCookie(c, COOKIE_SESSAO));
  if (!r.ok) {
    const mensagens: Record<string, string> = {
      sessao_substituida: 'Sua conta foi aberta em outro computador.',
      cliente_suspenso: 'O acesso deste cliente está suspenso.',
    };
    return erro(c, 401, r.motivo, mensagens[r.motivo] || 'Entre novamente.');
  }
  c.set('sessao', r);
  await next();
}

export const exigirPapel = (...papeis: SessaoValida['papel'][]) => async (c: C, next: Next) => {
  if (!papeis.includes(c.get('sessao').papel)) return erro(c, 403, 'sem_permissao', 'Seu perfil não pode fazer isso.');
  await next();
};

// O super admin não pertence a cliente nenhum: rotas de cliente exigem tenant.
export async function exigirTenant(c: C, next: Next) {
  if (!c.get('sessao').tenantId) return erro(c, 403, 'sem_cliente', 'Esta área é do painel do cliente.');
  await next();
}

export const exigirModulo = (modulo: string) => async (c: C, next: Next) => {
  const t = c.get('sessao').tenantId!;
  const mods = await modulosDoTenant(c.env.DB, t);
  if (!mods.has(modulo)) return erro(c, 403, 'modulo_bloqueado', 'Este recurso não faz parte do seu plano.');
  await next();
};
