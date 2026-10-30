// Sessões com ACESSO ÚNICO.
//
// Cada acesso pago é um login que só pode estar ativo num computador por
// vez. Entrar em outro computador marca as sessões anteriores do mesmo
// usuário como "substituídas". A sessão antiga recebe 401 com o código
// 'sessao_substituida' na próxima chamada — o editor mostra "sua conta foi
// aberta em outro computador" e salva o que estava fazendo.
//
// (Aviso instantâneo, sem esperar a próxima chamada, vem com um Durable
// Object na etapa seguinte; a regra de quem vale já fica certa aqui.)
//
// O token vai num cookie HttpOnly; o banco guarda só o SHA-256 dele.

import { b64urlAleatorio, sha256b64url } from './senha';

export const COOKIE_SESSAO = 'ea_sessao';
export const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;   // 30 dias

export type MotivoSessaoInvalida = 'sem_sessao' | 'sessao_invalida' | 'sessao_expirada'
  | 'sessao_substituida' | 'sessao_encerrada' | 'usuario_inativo' | 'cliente_suspenso';

export interface SessaoValida {
  ok: true;
  usuarioId: string;
  tenantId: string | null;
  papel: 'super' | 'dono' | 'editor' | 'operador';
  email: string;
  nome: string;
}
export type ResultadoSessao = SessaoValida | { ok: false; motivo: MotivoSessaoInvalida };

export async function criarSessao(db: D1Database, usuarioId: string, agente: string | null, agora = Date.now()) {
  const token = b64urlAleatorio(32);
  const hash = await sha256b64url(token);
  // As duas escritas no mesmo batch: não existe instante em que o usuário
  // tenha duas sessões válidas.
  await db.batch([
    db.prepare(`UPDATE sessoes SET substituida_em = ?
                WHERE usuario_id = ? AND substituida_em IS NULL AND encerrada_em IS NULL`)
      .bind(agora, usuarioId),
    db.prepare(`INSERT INTO sessoes (token_hash, usuario_id, criada_em, expira_em, agente)
                VALUES (?, ?, ?, ?, ?)`)
      .bind(hash, usuarioId, agora, agora + DURACAO_SESSAO_MS, agente ? agente.slice(0, 200) : null),
  ]);
  return { token, expiraEm: agora + DURACAO_SESSAO_MS };
}

export async function lerSessao(db: D1Database, token: string | undefined, agora = Date.now()): Promise<ResultadoSessao> {
  if (!token) return { ok: false, motivo: 'sem_sessao' };
  const hash = await sha256b64url(token);
  const s = await db.prepare(
    `SELECT s.expira_em, s.substituida_em, s.encerrada_em,
            u.id AS usuario_id, u.tenant_id, u.papel, u.email, u.nome, u.ativo,
            t.status AS tenant_status
       FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
  LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE s.token_hash = ?`).bind(hash).first<any>();
  if (!s) return { ok: false, motivo: 'sessao_invalida' };
  if (s.substituida_em) return { ok: false, motivo: 'sessao_substituida' };
  if (s.encerrada_em) return { ok: false, motivo: 'sessao_encerrada' };
  if (s.expira_em <= agora) return { ok: false, motivo: 'sessao_expirada' };
  if (!s.ativo) return { ok: false, motivo: 'usuario_inativo' };
  if (s.tenant_id && s.tenant_status !== 'ativo') return { ok: false, motivo: 'cliente_suspenso' };
  return { ok: true, usuarioId: s.usuario_id, tenantId: s.tenant_id, papel: s.papel, email: s.email, nome: s.nome };
}

export async function encerrarSessao(db: D1Database, token: string, agora = Date.now()) {
  const hash = await sha256b64url(token);
  await db.prepare('UPDATE sessoes SET encerrada_em = ? WHERE token_hash = ? AND encerrada_em IS NULL')
    .bind(agora, hash).run();
}
