// EncartaAi — API (Cloudflare Workers + D1).
//
// Três regras que valem para toda rota abaixo:
//  1. O cliente (tenant) vem SEMPRE da sessão. Nenhuma rota de cliente
//     aceita tenant_id vindo do navegador.
//  2. Módulo pago é conferido aqui (exigirModulo), não só escondido no front.
//  3. Escrita só com Content-Type JSON: um formulário de outro site não
//     consegue mandar isso sem passar pelo CORS, o que fecha o CSRF junto
//     com o cookie SameSite=Lax.

import { Hono, type Context, type Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { conferirSenha, gerarHashSenha, SENHA_MINIMO } from './lib/senha';
import { COOKIE_SESSAO, criarSessao, encerrarSessao, lerSessao, type SessaoValida } from './lib/sessao';
import { acessosEmUso, limiteDeAcessos, modulosDoTenant } from './lib/modulos';

export interface Env {
  DB: D1Database;
  SETUP_TOKEN?: string;
}
type Vars = { sessao: SessaoValida };
type C = Context<{ Bindings: Env; Variables: Vars }>;

const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath('/api');

const agora = () => Date.now();
const novoId = () => crypto.randomUUID();
const erro = (c: C, status: number, codigo: string, mensagem: string) =>
  c.json({ erro: codigo, mensagem }, status as any);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const SLUGS_RESERVADOS = new Set(['www', 'api', 'admin', 'app', 'go', 'painel', 'suporte', 'status']);

// Um hash de verdade, calculado uma vez, para gastar o mesmo tempo quando
// o e-mail não existe: sem isso, a resposta mais rápida conta quem é cliente.
let hashFantasma: Promise<string> | null = null;

async function lerJson<T>(c: C): Promise<T | null> {
  try { return await c.req.json<T>(); } catch { return null; }
}

async function auditar(db: D1Database, s: SessaoValida | null, tenantId: string | null, acao: string, detalhe: unknown) {
  await db.prepare('INSERT INTO auditoria (id, tenant_id, usuario_id, acao, detalhe, criado_em) VALUES (?,?,?,?,?,?)')
    .bind(novoId(), tenantId, s ? s.usuarioId : null, acao, JSON.stringify(detalhe ?? {}), agora()).run();
}

// ── middlewares ─────────────────────────────────────────────────────
app.use('*', async (c, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    const tipo = c.req.header('content-type') || '';
    if (!tipo.toLowerCase().startsWith('application/json')) {
      return erro(c, 415, 'json_obrigatorio', 'Envie os dados como JSON.');
    }
  }
  await next();
});

async function autenticar(c: C, next: Next) {
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

const exigirPapel = (...papeis: SessaoValida['papel'][]) => async (c: C, next: Next) => {
  if (!papeis.includes(c.get('sessao').papel)) return erro(c, 403, 'sem_permissao', 'Seu perfil não pode fazer isso.');
  await next();
};

// O super admin não pertence a cliente nenhum: rotas de cliente exigem tenant.
async function exigirTenant(c: C, next: Next) {
  if (!c.get('sessao').tenantId) return erro(c, 403, 'sem_cliente', 'Esta área é do painel do cliente.');
  await next();
}

const exigirModulo = (modulo: string) => async (c: C, next: Next) => {
  const t = c.get('sessao').tenantId!;
  const mods = await modulosDoTenant(c.env.DB, t);
  if (!mods.has(modulo)) return erro(c, 403, 'modulo_bloqueado', 'Este recurso não faz parte do seu plano.');
  await next();
};

// ── configuração inicial: cria o primeiro super admin ───────────────
// Só funciona com o SETUP_TOKEN (secret do Worker) e só enquanto não
// existir nenhum super. Depois disso a rota fica morta.
app.post('/setup', async (c) => {
  const b = await lerJson<{ token: string; email: string; nome: string; senha: string }>(c);
  const tok = c.env.SETUP_TOKEN;
  if (!tok || tok.length < 16 || !b || b.token !== tok) return erro(c, 403, 'setup_negado', 'Token de configuração inválido.');
  const ja = await c.env.DB.prepare("SELECT 1 FROM usuarios WHERE papel = 'super' LIMIT 1").first();
  if (ja) return erro(c, 409, 'setup_feito', 'A configuração inicial já foi feita.');
  if (!EMAIL_RE.test(b.email || '') || !b.nome || (b.senha || '').length < SENHA_MINIMO)
    return erro(c, 400, 'dados_invalidos', `Informe e-mail, nome e senha com ${SENHA_MINIMO}+ caracteres.`);
  const id = novoId();
  await c.env.DB.prepare('INSERT INTO usuarios (id, tenant_id, email, nome, senha_hash, papel, criado_em) VALUES (?,NULL,?,?,?,?,?)')
    .bind(id, b.email.trim(), b.nome.trim(), await gerarHashSenha(b.senha), 'super', agora()).run();
  await auditar(c.env.DB, null, null, 'setup_super', { email: b.email });
  return c.json({ ok: true }, 201);
});

// ── entrar / sair / eu ──────────────────────────────────────────────
app.post('/auth/entrar', async (c) => {
  const b = await lerJson<{ email: string; senha: string }>(c);
  const recusa = () => erro(c, 401, 'credenciais', 'E-mail ou senha incorretos.');
  if (!b || typeof b.email !== 'string' || typeof b.senha !== 'string') return recusa();
  const u = await c.env.DB.prepare('SELECT id, senha_hash, ativo FROM usuarios WHERE email = ?')
    .bind(b.email.trim()).first<{ id: string; senha_hash: string; ativo: number }>();
  if (!u) {
    hashFantasma ??= gerarHashSenha('fantasma-' + crypto.randomUUID());
    await conferirSenha(b.senha, await hashFantasma);
    return recusa();
  }
  if (!(await conferirSenha(b.senha, u.senha_hash)) || !u.ativo) return recusa();

  const { token, expiraEm } = await criarSessao(c.env.DB, u.id, c.req.header('user-agent') || null);
  setCookie(c, COOKIE_SESSAO, token, {
    httpOnly: true, secure: true, sameSite: 'Lax', path: '/', expires: new Date(expiraEm),
  });
  return c.json({ ok: true });
});

app.post('/auth/sair', async (c) => {
  const tok = getCookie(c, COOKIE_SESSAO);
  if (tok) await encerrarSessao(c.env.DB, tok);
  deleteCookie(c, COOKIE_SESSAO, { path: '/', secure: true });
  return c.json({ ok: true });
});

app.get('/eu', autenticar, async (c) => {
  const s = c.get('sessao');
  const usuario = { id: s.usuarioId, email: s.email, nome: s.nome, papel: s.papel };
  if (!s.tenantId) return c.json({ usuario, cliente: null, modulos: [] });
  const t = await c.env.DB.prepare(
    `SELECT t.id, t.nome, t.slug, t.plano_id, p.nome AS plano_nome, p.creditos_ia_mes
       FROM tenants t JOIN planos p ON p.id = t.plano_id WHERE t.id = ?`).bind(s.tenantId).first<any>();
  return c.json({
    usuario,
    cliente: t,
    modulos: [...(await modulosDoTenant(c.env.DB, s.tenantId))].sort(),
    acessos: { limite: await limiteDeAcessos(c.env.DB, s.tenantId), emUso: await acessosEmUso(c.env.DB, s.tenantId) },
  });
});

// ── painel do super admin ───────────────────────────────────────────
const admin = new Hono<{ Bindings: Env; Variables: Vars }>();
admin.use('*', autenticar, exigirPapel('super'));

admin.get('/clientes', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.slug, t.nome, t.plano_id, t.status, t.acessos_extras, t.criado_em,
            (SELECT COUNT(*) FROM usuarios u WHERE u.tenant_id = t.id AND u.ativo = 1) AS acessos_em_uso
       FROM tenants t ORDER BY t.criado_em DESC`).all();
  return c.json({ clientes: results });
});

admin.post('/clientes', async (c) => {
  const b = await lerJson<{ nome: string; slug: string; plano_id: string; dono: { email: string; nome: string; senha: string } }>(c);
  if (!b || !b.nome || !b.dono) return erro(c, 400, 'dados_invalidos', 'Informe nome, slug, plano e o dono.');
  const slug = (b.slug || '').toLowerCase();
  if (!SLUG_RE.test(slug) || SLUGS_RESERVADOS.has(slug))
    return erro(c, 400, 'slug_invalido', 'Use 3 a 40 letras minúsculas, números ou hífen.');
  if (!EMAIL_RE.test(b.dono.email || '') || !b.dono.nome || (b.dono.senha || '').length < SENHA_MINIMO)
    return erro(c, 400, 'dono_invalido', `O dono precisa de e-mail, nome e senha com ${SENHA_MINIMO}+ caracteres.`);
  const plano = await c.env.DB.prepare('SELECT id FROM planos WHERE id = ? AND ativo = 1').bind(b.plano_id).first();
  if (!plano) return erro(c, 400, 'plano_invalido', 'Plano inexistente.');
  const conflito = await c.env.DB.prepare(
    'SELECT (SELECT 1 FROM tenants WHERE slug = ?) AS s, (SELECT 1 FROM usuarios WHERE email = ?) AS e')
    .bind(slug, b.dono.email.trim()).first<{ s: number | null; e: number | null }>();
  if (conflito?.s) return erro(c, 409, 'slug_em_uso', 'Esse endereço já pertence a outro cliente.');
  if (conflito?.e) return erro(c, 409, 'email_em_uso', 'Esse e-mail já tem cadastro.');

  const tid = novoId(), uid = novoId(), t0 = agora();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO tenants (id, slug, nome, plano_id, criado_em) VALUES (?,?,?,?,?)')
      .bind(tid, slug, b.nome.trim(), b.plano_id, t0),
    c.env.DB.prepare('INSERT INTO usuarios (id, tenant_id, email, nome, senha_hash, papel, criado_em) VALUES (?,?,?,?,?,?,?)')
      .bind(uid, tid, b.dono.email.trim(), b.dono.nome.trim(), await gerarHashSenha(b.dono.senha), 'dono', t0),
    c.env.DB.prepare('INSERT INTO kits_marca (tenant_id, dados, atualizado_em) VALUES (?,?,?)').bind(tid, '{}', t0),
  ]);
  await auditar(c.env.DB, c.get('sessao'), tid, 'cliente_criado', { slug, plano: b.plano_id });
  return c.json({ id: tid, slug }, 201);
});

admin.put('/clientes/:id', async (c) => {
  const id = c.req.param('id');
  const b = await lerJson<{ plano_id?: string; status?: string; acessos_extras?: number }>(c);
  if (!b) return erro(c, 400, 'dados_invalidos', 'Corpo vazio.');
  const t = await c.env.DB.prepare('SELECT id FROM tenants WHERE id = ?').bind(id).first();
  if (!t) return erro(c, 404, 'nao_encontrado', 'Cliente não encontrado.');
  if (b.plano_id !== undefined) {
    const p = await c.env.DB.prepare('SELECT id FROM planos WHERE id = ? AND ativo = 1').bind(b.plano_id).first();
    if (!p) return erro(c, 400, 'plano_invalido', 'Plano inexistente.');
  }
  if (b.status !== undefined && !['ativo', 'suspenso', 'cancelado'].includes(b.status))
    return erro(c, 400, 'status_invalido', 'Status deve ser ativo, suspenso ou cancelado.');
  if (b.acessos_extras !== undefined && (!Number.isInteger(b.acessos_extras) || b.acessos_extras < 0 || b.acessos_extras > 500))
    return erro(c, 400, 'acessos_invalidos', 'Acessos extras entre 0 e 500.');
  await c.env.DB.prepare(
    `UPDATE tenants SET plano_id = COALESCE(?, plano_id), status = COALESCE(?, status),
            acessos_extras = COALESCE(?, acessos_extras) WHERE id = ?`)
    .bind(b.plano_id ?? null, b.status ?? null, b.acessos_extras ?? null, id).run();
  await auditar(c.env.DB, c.get('sessao'), id, 'cliente_alterado', b);
  return c.json({ ok: true });
});

// ativo: true libera fora do plano · false bloqueia · null volta ao padrão do plano
admin.put('/clientes/:id/modulos/:modulo', async (c) => {
  const { id, modulo } = c.req.param();
  const b = await lerJson<{ ativo: boolean | null; motivo?: string }>(c);
  if (!b || !('ativo' in b)) return erro(c, 400, 'dados_invalidos', 'Informe ativo: true, false ou null.');
  const existe = await c.env.DB.prepare(
    'SELECT (SELECT 1 FROM tenants WHERE id = ?) AS t, (SELECT 1 FROM modulos WHERE id = ?) AS m')
    .bind(id, modulo).first<{ t: number | null; m: number | null }>();
  if (!existe?.t || !existe?.m) return erro(c, 404, 'nao_encontrado', 'Cliente ou módulo inexistente.');
  if (b.ativo === null) {
    await c.env.DB.prepare('DELETE FROM tenant_modulos WHERE tenant_id = ? AND modulo_id = ?').bind(id, modulo).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO tenant_modulos (tenant_id, modulo_id, ativo, motivo) VALUES (?,?,?,?)
       ON CONFLICT (tenant_id, modulo_id) DO UPDATE SET ativo = excluded.ativo, motivo = excluded.motivo`)
      .bind(id, modulo, b.ativo ? 1 : 0, b.motivo ?? null).run();
  }
  await auditar(c.env.DB, c.get('sessao'), id, 'modulo_alterado', { modulo, ativo: b.ativo, motivo: b.motivo });
  return c.json({ ok: true, modulos: [...(await modulosDoTenant(c.env.DB, id))].sort() });
});

app.route('/admin', admin);

// ── painel do cliente ───────────────────────────────────────────────
const cliente = new Hono<{ Bindings: Env; Variables: Vars }>();
cliente.use('*', autenticar, exigirTenant);

cliente.get('/usuarios', exigirPapel('dono'), async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, email, nome, papel, ativo, criado_em FROM usuarios WHERE tenant_id = ? ORDER BY criado_em')
    .bind(c.get('sessao').tenantId).all();
  return c.json({ usuarios: results });
});

cliente.post('/usuarios', exigirPapel('dono'), async (c) => {
  const s = c.get('sessao');
  const b = await lerJson<{ email: string; nome: string; senha: string; papel: string }>(c);
  if (!b || !EMAIL_RE.test(b.email || '') || !b.nome || (b.senha || '').length < SENHA_MINIMO)
    return erro(c, 400, 'dados_invalidos', `Informe e-mail, nome e senha com ${SENHA_MINIMO}+ caracteres.`);
  if (!['dono', 'editor', 'operador'].includes(b.papel)) return erro(c, 400, 'papel_invalido', 'Papel deve ser dono, editor ou operador.');
  const limite = await limiteDeAcessos(c.env.DB, s.tenantId!);
  if ((await acessosEmUso(c.env.DB, s.tenantId!)) >= limite)
    return erro(c, 402, 'limite_acessos', `Seu plano permite ${limite} acesso(s). Contrate um acesso extra para cadastrar mais.`);
  const ja = await c.env.DB.prepare('SELECT 1 FROM usuarios WHERE email = ?').bind(b.email.trim()).first();
  if (ja) return erro(c, 409, 'email_em_uso', 'Esse e-mail já tem cadastro.');
  const id = novoId();
  await c.env.DB.prepare('INSERT INTO usuarios (id, tenant_id, email, nome, senha_hash, papel, criado_em) VALUES (?,?,?,?,?,?,?)')
    .bind(id, s.tenantId, b.email.trim(), b.nome.trim(), await gerarHashSenha(b.senha), b.papel, agora()).run();
  await auditar(c.env.DB, s, s.tenantId, 'usuario_criado', { email: b.email, papel: b.papel });
  return c.json({ id }, 201);
});

cliente.get('/lojas', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, nome, logo_asset_id, rodape_texto, criado_em FROM lojas WHERE tenant_id = ? ORDER BY nome')
    .bind(c.get('sessao').tenantId).all();
  return c.json({ lojas: results });
});

cliente.post('/lojas', exigirPapel('dono', 'editor'), async (c) => {
  const s = c.get('sessao');
  const b = await lerJson<{ nome: string; rodape_texto?: string }>(c);
  if (!b || !b.nome || !b.nome.trim()) return erro(c, 400, 'dados_invalidos', 'Informe o nome da loja.');
  const id = novoId();
  await c.env.DB.prepare('INSERT INTO lojas (id, tenant_id, nome, rodape_texto, criado_em) VALUES (?,?,?,?,?)')
    .bind(id, s.tenantId, b.nome.trim().slice(0, 120), b.rodape_texto ?? null, agora()).run();
  return c.json({ id }, 201);
});

// DELETE com o tenant da sessão NA CONDIÇÃO: id de loja de outro cliente
// simplesmente não acha nada — responde 404, não "proibido", para não
// confirmar que o id existe.
cliente.delete('/lojas/:id', exigirPapel('dono'), async (c) => {
  const s = c.get('sessao');
  const r = await c.env.DB.prepare('DELETE FROM lojas WHERE id = ? AND tenant_id = ?')
    .bind(c.req.param('id'), s.tenantId).run();
  if (!r.meta.changes) return erro(c, 404, 'nao_encontrado', 'Loja não encontrada.');
  await auditar(c.env.DB, s, s.tenantId, 'loja_excluida', { id: c.req.param('id') });
  return c.json({ ok: true });
});

// Registro de exportação: a rota que cada módulo chama ao exportar.
// É o ponto onde o servidor confere o plano e conta o consumo do mês.
const MODULOS_EXPORTAVEIS = new Set(['encarte', 'video', 'social', 'impressao']);
cliente.post('/exportacoes/:modulo', async (c, next) => {
  const m = c.req.param('modulo');
  if (!MODULOS_EXPORTAVEIS.has(m)) return erro(c, 404, 'nao_encontrado', 'Tipo de exportação desconhecido.');
  return exigirModulo(m)(c, next);
}, async (c) => {
  const s = c.get('sessao');
  const mes = new Date().toISOString().slice(0, 7);
  await c.env.DB.prepare(
    `INSERT INTO consumo (tenant_id, mes, metrica, quantidade) VALUES (?,?,?,1)
     ON CONFLICT (tenant_id, mes, metrica) DO UPDATE SET quantidade = quantidade + 1`)
    .bind(s.tenantId, mes, 'exportacoes_' + c.req.param('modulo')).run();
  return c.json({ ok: true });
});

app.route('/', cliente);

app.notFound((c) => erro(c, 404, 'nao_encontrado', 'Rota inexistente.'));
app.onError((e, c) => {
  console.error('[api]', e);
  return erro(c, 500, 'erro_interno', 'Erro inesperado. Tente de novo.');
});

export default app;
