// Testes do núcleo — rodam num Worker de verdade (workerd) com D1 local.
//
// O que precisa ser verdade para o EncartaAi poder ser vendido:
//   · só entra quem tem senha certa, e a mensagem não revela quem é cliente
//   · acesso único: o segundo computador derruba o primeiro
//   · cliente A nunca vê nem apaga nada do cliente B
//   · módulo fora do plano é recusado PELO SERVIDOR
//   · o limite de acessos do plano vale
//   · o super admin só nasce uma vez, com o token
import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

const BASE = 'https://api.encartaai.test/api';
type R = { status: number; json: any; cookie: string | null };

async function req(metodo: string, caminho: string, corpo?: unknown, cookie?: string | null, extra: Record<string, string> = {}): Promise<R> {
  const h: Record<string, string> = { ...extra };
  if (corpo !== undefined) h['content-type'] = 'application/json';
  if (cookie) h['cookie'] = cookie;
  const r = await SELF.fetch(BASE + caminho, { method: metodo, headers: h, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const sc = r.headers.get('set-cookie');
  return { status: r.status, json: await r.json().catch(() => null), cookie: sc ? sc.split(';')[0] : null };
}
const entrar = async (email: string, senha: string) => (await req('POST', '/auth/entrar', { email, senha })).cookie;

let SUPER: string | null;
let TENANT_A: string, TENANT_B: string;
let DONO_A: string | null, DONO_B: string | null;

beforeAll(async () => {
  const s = await req('POST', '/setup', { token: 'token-de-teste-com-mais-de-16', email: 'daniel@incomunicacao.com.br', nome: 'Daniel', senha: 'senha-super-123' });
  expect(s.status).toBe(201);
  SUPER = await entrar('daniel@incomunicacao.com.br', 'senha-super-123');
  const a = await req('POST', '/admin/clientes', { nome: 'Terê Frutas', slug: 'terefrutas', plano_id: 'completo',
    dono: { email: 'dono@terefrutas.com.br', nome: 'Dono Terê', senha: 'senha-tere-123' } }, SUPER);
  const b = await req('POST', '/admin/clientes', { nome: 'Mercado Exemplo', slug: 'exemplo', plano_id: 'basico',
    dono: { email: 'dono@exemplo.com.br', nome: 'Dono Exemplo', senha: 'senha-exemplo-123' } }, SUPER);
  expect(a.status).toBe(201); expect(b.status).toBe(201);
  TENANT_A = a.json.id; TENANT_B = b.json.id;
  DONO_A = await entrar('dono@terefrutas.com.br', 'senha-tere-123');
  DONO_B = await entrar('dono@exemplo.com.br', 'senha-exemplo-123');
});

describe('configuração inicial', () => {
  it('o super admin só nasce uma vez', async () => {
    const r = await req('POST', '/setup', { token: 'token-de-teste-com-mais-de-16', email: 'outro@x.com', nome: 'X', senha: '12345678' });
    expect(r.status).toBe(409);
  });
  it('token errado é recusado', async () => {
    const r = await req('POST', '/setup', { token: 'errado', email: 'a@b.com', nome: 'X', senha: '12345678' });
    expect(r.status).toBe(403);
  });
});

describe('entrar', () => {
  it('senha errada e e-mail inexistente dão a MESMA resposta', async () => {
    const a = await req('POST', '/auth/entrar', { email: 'dono@terefrutas.com.br', senha: 'errada-123' });
    const b = await req('POST', '/auth/entrar', { email: 'ninguem@nada.com', senha: 'errada-123' });
    expect(a.status).toBe(401); expect(b.status).toBe(401);
    expect(a.json).toEqual(b.json);
    expect(a.cookie).toBeNull();
  });
  it('e-mail não diferencia maiúsculas', async () => {
    expect(await entrar('DONO@TereFrutas.com.br', 'senha-tere-123')).toBeTruthy();
    DONO_A = await entrar('dono@terefrutas.com.br', 'senha-tere-123');  // refaz: a linha acima derrubou a anterior
  });
  it('o cookie é HttpOnly, Secure e SameSite=Lax', async () => {
    const r = await SELF.fetch(BASE + '/auth/entrar', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'dono@exemplo.com.br', senha: 'senha-exemplo-123' }) });
    const sc = r.headers.get('set-cookie') || '';
    expect(sc).toMatch(/HttpOnly/i); expect(sc).toMatch(/Secure/i); expect(sc).toMatch(/SameSite=Lax/i);
    DONO_B = sc.split(';')[0];
  });
  it('o banco guarda só o hash do token', async () => {
    const tok = DONO_A!.split('=')[1];
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessoes WHERE token_hash = ?').bind(tok).first<{ n: number }>();
    expect(r!.n).toBe(0);
  });
  it('escrita sem JSON é recusada (CSRF)', async () => {
    const r = await SELF.fetch(BASE + '/auth/entrar', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=a&senha=b' });
    expect(r.status).toBe(415);
  });
});

describe('acesso único', () => {
  it('entrar no segundo computador derruba o primeiro', async () => {
    const pc1 = await entrar('dono@terefrutas.com.br', 'senha-tere-123');
    expect((await req('GET', '/eu', undefined, pc1)).status).toBe(200);
    const pc2 = await entrar('dono@terefrutas.com.br', 'senha-tere-123');
    const r1 = await req('GET', '/eu', undefined, pc1);
    expect(r1.status).toBe(401);
    expect(r1.json.erro).toBe('sessao_substituida');
    expect((await req('GET', '/eu', undefined, pc2)).status).toBe(200);
    DONO_A = pc2;
  });
  it('sair encerra a sessão', async () => {
    const c = await entrar('dono@exemplo.com.br', 'senha-exemplo-123');
    await req('POST', '/auth/sair', {}, c);
    const r = await req('GET', '/eu', undefined, c);
    expect(r.status).toBe(401); expect(r.json.erro).toBe('sessao_encerrada');
    DONO_B = await entrar('dono@exemplo.com.br', 'senha-exemplo-123');
  });
});

describe('isolamento entre clientes', () => {
  it('cada cliente só vê as próprias lojas', async () => {
    await req('POST', '/lojas', { nome: 'Cascatinha' }, DONO_A);
    await req('POST', '/lojas', { nome: 'Loja do Exemplo' }, DONO_B);
    const a = await req('GET', '/lojas', undefined, DONO_A);
    const b = await req('GET', '/lojas', undefined, DONO_B);
    expect(a.json.lojas.map((l: any) => l.nome)).toEqual(['Cascatinha']);
    expect(b.json.lojas.map((l: any) => l.nome)).toEqual(['Loja do Exemplo']);
  });
  it('apagar a loja do outro cliente dá 404 e não apaga', async () => {
    const b = await req('GET', '/lojas', undefined, DONO_B);
    const idB = b.json.lojas[0].id;
    const r = await req('DELETE', '/lojas/' + idB, {}, DONO_A);
    expect(r.status).toBe(404);
    expect((await req('GET', '/lojas', undefined, DONO_B)).json.lojas).toHaveLength(1);
  });
  it('enviar tenant_id no corpo não muda de cliente', async () => {
    await req('POST', '/lojas', { nome: 'Intrusa', tenant_id: TENANT_B }, DONO_A);
    const b = await req('GET', '/lojas', undefined, DONO_B);
    expect(b.json.lojas.map((l: any) => l.nome)).not.toContain('Intrusa');
  });
  it('dono de cliente não entra no painel do super admin', async () => {
    expect((await req('GET', '/admin/clientes', undefined, DONO_A)).status).toBe(403);
  });
});

describe('módulos por plano', () => {
  it('o /eu lista os módulos do plano', async () => {
    const a = await req('GET', '/eu', undefined, DONO_A);
    const b = await req('GET', '/eu', undefined, DONO_B);
    expect(a.json.modulos).toContain('impressao');
    expect(a.json.modulos).toContain('ia');
    expect(b.json.modulos).toEqual(['encarte']);
  });
  it('o servidor recusa exportar módulo fora do plano', async () => {
    expect((await req('POST', '/exportacoes/encarte', {}, DONO_B)).status).toBe(200);
    const v = await req('POST', '/exportacoes/video', {}, DONO_B);
    expect(v.status).toBe(403); expect(v.json.erro).toBe('modulo_bloqueado');
  });
  it('o super admin libera um módulo como bônus e depois volta ao plano', async () => {
    let r = await req('PUT', `/admin/clientes/${TENANT_B}/modulos/video`, { ativo: true, motivo: 'teste 7 dias' }, SUPER);
    expect(r.json.modulos).toContain('video');
    expect((await req('POST', '/exportacoes/video', {}, DONO_B)).status).toBe(200);
    r = await req('PUT', `/admin/clientes/${TENANT_B}/modulos/video`, { ativo: null }, SUPER);
    expect(r.json.modulos).not.toContain('video');
    expect((await req('POST', '/exportacoes/video', {}, DONO_B)).status).toBe(403);
  });
  it('e também bloqueia um módulo que o plano daria', async () => {
    await req('PUT', `/admin/clientes/${TENANT_A}/modulos/ia`, { ativo: false }, SUPER);
    expect((await req('GET', '/eu', undefined, DONO_A)).json.modulos).not.toContain('ia');
    await req('PUT', `/admin/clientes/${TENANT_A}/modulos/ia`, { ativo: null }, SUPER);
  });
  it('a exportação conta no consumo do mês', async () => {
    const r = await env.DB.prepare("SELECT quantidade FROM consumo WHERE tenant_id = ? AND metrica = 'exportacoes_encarte'")
      .bind(TENANT_B).first<{ quantidade: number }>();
    expect(r!.quantidade).toBeGreaterThanOrEqual(1);
  });
});

describe('acessos do plano', () => {
  it('plano com 1 acesso não cadastra o segundo usuário', async () => {
    const r = await req('POST', '/usuarios', { email: 'editor@terefrutas.com.br', nome: 'Editor', senha: 'senha-editor-1', papel: 'editor' }, DONO_A);
    expect(r.status).toBe(402); expect(r.json.erro).toBe('limite_acessos');
  });
  it('com um acesso extra contratado, cadastra', async () => {
    await req('PUT', `/admin/clientes/${TENANT_A}`, { acessos_extras: 1 }, SUPER);
    const r = await req('POST', '/usuarios', { email: 'editor@terefrutas.com.br', nome: 'Editor', senha: 'senha-editor-1', papel: 'editor' }, DONO_A);
    expect(r.status).toBe(201);
    const eu = await req('GET', '/eu', undefined, DONO_A);
    expect(eu.json.acessos).toEqual({ limite: 2, emUso: 2 });
  });
  it('editor não cadastra usuários nem apaga lojas', async () => {
    const ed = await entrar('editor@terefrutas.com.br', 'senha-editor-1');
    expect((await req('POST', '/usuarios', { email: 'x@y.com', nome: 'X', senha: '12345678', papel: 'editor' }, ed)).status).toBe(403);
    const l = await req('GET', '/lojas', undefined, ed);
    expect((await req('DELETE', '/lojas/' + l.json.lojas[0].id, {}, ed)).status).toBe(403);
  });
});

describe('suspensão', () => {
  it('cliente suspenso perde o acesso na hora', async () => {
    await req('PUT', `/admin/clientes/${TENANT_B}`, { status: 'suspenso' }, SUPER);
    const r = await req('GET', '/eu', undefined, DONO_B);
    expect(r.status).toBe(401); expect(r.json.erro).toBe('cliente_suspenso');
    await req('PUT', `/admin/clientes/${TENANT_B}`, { status: 'ativo' }, SUPER);
    expect((await req('GET', '/eu', undefined, DONO_B)).status).toBe(200);
  });
  it('mudanças de plano e módulo ficam na auditoria', async () => {
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE acao IN ('modulo_alterado','cliente_alterado')").first<{ n: number }>();
    expect(r!.n).toBeGreaterThanOrEqual(4);
  });
});
