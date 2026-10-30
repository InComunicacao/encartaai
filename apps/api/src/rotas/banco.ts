// Banco de imagens, produtos e correlação.
//
// Quem vê o quê:
//   · cada cliente vê os próprios arquivos + o banco GLOBAL (curado pelo
//     super admin);
//   · arquivo global com a etiqueta "modulo:<id>" só aparece para quem tem
//     esse módulo — é assim que a Gotham fica só no plano Completo;
//   · ninguém apaga arquivo global pelo painel do cliente.

import { Hono } from 'hono';
import { type AppEnv, type C, agora, auditar, erro, exigirPapel, lerJson, novoId } from '../http';
import { detectarTipo, dimensoes } from '../lib/arquivos';
import { normalizarApelido, palavras, pontuar, PONTUACAO_MINIMA, soDigitos } from '../lib/correlacao';
import { modulosDoTenant } from '../lib/modulos';

export const ROTA_UPLOAD = '/assets/arquivo';

const TIPOS_ASSET = ['produto', 'logo', 'tema', 'fundo', 'selo', 'personagem', 'fonte'] as const;
const LIMITE_IMAGEM = 15 * 1024 * 1024;
const LIMITE_FONTE = 5 * 1024 * 1024;

// Filtro SQL de visibilidade: próprios + globais liberados pelos módulos.
// Os módulos entram como parâmetro JSON; json_each evita montar SQL com texto.
const VISIVEL = `(a.tenant_id = ?1 OR (a.tenant_id IS NULL AND NOT EXISTS (
    SELECT 1 FROM json_each(a.etiquetas) e
     WHERE e.value LIKE 'modulo:%' AND substr(e.value, 8) NOT IN (SELECT value FROM json_each(?2)))))`;

async function contextoVisivel(c: C) {
  const t = c.get('sessao').tenantId!;
  return { t, mods: JSON.stringify([...(await modulosDoTenant(c.env.DB, t))]) };
}

function nomeLimpo(s: string | undefined): string {
  return (s || 'arquivo').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 160) || 'arquivo';
}

// Recebe o binário, confere o tipo real e grava no R2 + D1.
async function receberArquivo(c: C, tenantId: string | null) {
  const tipo = c.req.query('tipo') as (typeof TIPOS_ASSET)[number];
  if (!TIPOS_ASSET.includes(tipo)) return { falha: erro(c, 400, 'tipo_invalido', 'Tipo deve ser: ' + TIPOS_ASSET.join(', ') + '.') };
  const declarado = Number(c.req.header('content-length') || 0);
  if (declarado > LIMITE_IMAGEM) return { falha: erro(c, 413, 'arquivo_grande', 'Arquivo acima de 15 MB.') };

  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const real = detectarTipo(bytes);
  if (!real) return { falha: erro(c, 415, 'formato_recusado', 'Formato não aceito. Use PNG, JPG, WebP ou fonte WOFF2/WOFF/TTF/OTF.') };
  if ((tipo === 'fonte') !== (real.categoria === 'fonte'))
    return { falha: erro(c, 415, 'formato_recusado', tipo === 'fonte' ? 'Esse arquivo não é uma fonte.' : 'Esse arquivo não é uma imagem.') };
  if (bytes.length > (real.categoria === 'fonte' ? LIMITE_FONTE : LIMITE_IMAGEM))
    return { falha: erro(c, 413, 'arquivo_grande', real.categoria === 'fonte' ? 'Fonte acima de 5 MB.' : 'Imagem acima de 15 MB.') };

  const etiquetas = (c.req.query('etiquetas') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const id = novoId();
  const chave = `${tenantId ? 'tenants/' + tenantId : 'global'}/${tipo}/${id}.${real.ext}`;
  const dim = real.categoria === 'imagem' ? dimensoes(bytes, real.mime) : null;
  const nome = nomeLimpo(c.req.query('nome'));

  await c.env.ARQUIVOS.put(chave, bytes, { httpMetadata: { contentType: real.mime } });
  await c.env.DB.prepare(
    `INSERT INTO assets (id, tenant_id, tipo, r2_chave, nome, mime, bytes, largura, altura, etiquetas, criado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, tenantId, tipo, chave, nome, real.mime, bytes.length, dim?.w ?? null, dim?.h ?? null,
      JSON.stringify(etiquetas), agora()).run();
  return { id, tipo, nome, mime: real.mime, bytes: bytes.length, largura: dim?.w ?? null, altura: dim?.h ?? null };
}

// Foto de produto com EAN no nome ou no parâmetro vincula sozinha:
// acha (ou cria) o produto daquele EAN e vira a foto principal se ele
// ainda não tiver uma.
async function vincularPorEan(c: C, tenantId: string, assetId: string, nome: string): Promise<string | null> {
  const ean = soDigitos(c.req.query('ean')) || soDigitos((nome.match(/\d{8,14}/) || [])[0]);
  if (!ean) return null;
  let p = await c.env.DB.prepare('SELECT id FROM produtos WHERE tenant_id = ? AND ean = ?').bind(tenantId, ean).first<{ id: string }>();
  if (!p) {
    const nomeProduto = nome.replace(/\d{8,14}/, '').replace(/[-_]+/g, ' ').trim() || 'Produto ' + ean;
    p = { id: novoId() };
    await c.env.DB.prepare('INSERT INTO produtos (id, tenant_id, ean, nome, criado_em) VALUES (?,?,?,?,?)')
      .bind(p.id, tenantId, ean, nomeProduto.slice(0, 160), agora()).run();
  }
  const temPrincipal = await c.env.DB.prepare('SELECT 1 FROM produto_imagens WHERE produto_id = ? AND principal = 1').bind(p.id).first();
  await c.env.DB.prepare('INSERT OR IGNORE INTO produto_imagens (produto_id, asset_id, principal) VALUES (?,?,?)')
    .bind(p.id, assetId, temPrincipal ? 0 : 1).run();
  return p.id;
}

// ═══ painel do cliente ═══════════════════════════════════════════════
export const rotasBanco = new Hono<AppEnv>();

rotasBanco.post(ROTA_UPLOAD, exigirPapel('dono', 'editor'), async (c) => {
  const t = c.get('sessao').tenantId!;
  const r = await receberArquivo(c, t);
  if ('falha' in r) return r.falha;
  const produtoId = r.tipo === 'produto' ? await vincularPorEan(c, t, r.id, r.nome) : null;
  return c.json({ ...r, produto_id: produtoId }, 201);
});

rotasBanco.get('/assets', async (c) => {
  const { t, mods } = await contextoVisivel(c);
  const tipo = c.req.query('tipo');
  const q = (c.req.query('q') || '').trim();
  const limite = Math.min(Math.max(Number(c.req.query('limite')) || 100, 1), 500);
  const { results } = await c.env.DB.prepare(
    `SELECT a.id, a.tipo, a.nome, a.mime, a.bytes, a.largura, a.altura, a.etiquetas,
            (a.tenant_id IS NULL) AS global, a.criado_em
       FROM assets a
      WHERE ${VISIVEL} AND (?3 IS NULL OR a.tipo = ?3) AND (?4 = '' OR a.nome LIKE '%' || ?4 || '%')
      ORDER BY a.criado_em DESC LIMIT ?5`)
    .bind(t, mods, tipo ?? null, q, limite).all<any>();
  return c.json({ assets: results.map((a) => ({ ...a, global: !!a.global, etiquetas: JSON.parse(a.etiquetas) })) });
});

rotasBanco.get('/assets/:id/arquivo', async (c) => {
  const { t, mods } = await contextoVisivel(c);
  const a = await c.env.DB.prepare(`SELECT a.r2_chave, a.mime, a.nome FROM assets a WHERE a.id = ?3 AND ${VISIVEL}`)
    .bind(t, mods, c.req.param('id')).first<{ r2_chave: string; mime: string; nome: string }>();
  if (!a) return erro(c, 404, 'nao_encontrado', 'Arquivo não encontrado.');
  const obj = await c.env.ARQUIVOS.get(a.r2_chave);
  if (!obj) return erro(c, 404, 'nao_encontrado', 'Arquivo não encontrado.');
  return new Response(obj.body, {
    headers: {
      'content-type': a.mime,
      'cache-control': 'private, max-age=86400',
      'x-content-type-options': 'nosniff',
      // O arquivo é servido do nosso domínio: nada nele pode rodar como página.
      'content-security-policy': "default-src 'none'; sandbox",
      'cross-origin-resource-policy': 'same-origin',
    },
  });
});

// Antes de apagar, diz onde o arquivo está em uso. Só apaga com
// { confirmar: true } — a exclusão é definitiva.
rotasBanco.delete('/assets/:id', exigirPapel('dono', 'editor'), async (c) => {
  const s = c.get('sessao');
  const id = c.req.param('id');
  const a = await c.env.DB.prepare('SELECT r2_chave, nome FROM assets WHERE id = ? AND tenant_id = ?')
    .bind(id, s.tenantId).first<{ r2_chave: string; nome: string }>();
  if (!a) return erro(c, 404, 'nao_encontrado', 'Arquivo não encontrado.');
  const usos = (await c.env.DB.prepare(
    `SELECT 'produto' AS onde, p.nome FROM produto_imagens pi JOIN produtos p ON p.id = pi.produto_id
      WHERE pi.asset_id = ?1 AND p.tenant_id = ?2
     UNION ALL
     SELECT 'loja' AS onde, nome FROM lojas WHERE logo_asset_id = ?1 AND tenant_id = ?2`)
    .bind(id, s.tenantId).all<{ onde: string; nome: string }>()).results;
  const b = await lerJson<{ confirmar?: boolean }>(c);
  if (usos.length && !b?.confirmar)
    return erro(c, 409, 'em_uso', `Este arquivo está em uso em ${usos.length} lugar(es).`, { usos });
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE lojas SET logo_asset_id = NULL WHERE logo_asset_id = ? AND tenant_id = ?').bind(id, s.tenantId),
    c.env.DB.prepare('DELETE FROM assets WHERE id = ? AND tenant_id = ?').bind(id, s.tenantId),
  ]);
  await c.env.ARQUIVOS.delete(a.r2_chave);
  await auditar(c.env.DB, s, s.tenantId, 'asset_excluido', { id, nome: a.nome, usos: usos.length });
  return c.json({ ok: true });
});

// ── produtos ────────────────────────────────────────────────────────
async function fotoPrincipal(db: D1Database, produtoId: string): Promise<string | null> {
  const r = await db.prepare('SELECT asset_id FROM produto_imagens WHERE produto_id = ? ORDER BY principal DESC LIMIT 1')
    .bind(produtoId).first<{ asset_id: string }>();
  return r ? r.asset_id : null;
}

rotasBanco.get('/produtos', async (c) => {
  const t = c.get('sessao').tenantId!;
  const q = (c.req.query('q') || '').trim();
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.ean, p.nome, p.descricao, p.categoria,
            (SELECT asset_id FROM produto_imagens WHERE produto_id = p.id ORDER BY principal DESC LIMIT 1) AS foto_id
       FROM produtos p
      WHERE p.tenant_id = ?1 AND (?2 = '' OR p.nome LIKE '%' || ?2 || '%' OR p.ean = ?2)
      ORDER BY p.nome LIMIT 500`).bind(t, q).all();
  return c.json({ produtos: results });
});

rotasBanco.post('/produtos', exigirPapel('dono', 'editor'), async (c) => {
  const t = c.get('sessao').tenantId!;
  const b = await lerJson<{ nome: string; ean?: string; descricao?: string; categoria?: string }>(c);
  if (!b?.nome?.trim()) return erro(c, 400, 'dados_invalidos', 'Informe o nome do produto.');
  const ean = soDigitos(b.ean);
  if (b.ean && !ean) return erro(c, 400, 'ean_invalido', 'EAN deve ter 6 a 14 dígitos.');
  if (ean && await c.env.DB.prepare('SELECT 1 FROM produtos WHERE tenant_id = ? AND ean = ?').bind(t, ean).first())
    return erro(c, 409, 'ean_em_uso', 'Já existe um produto com esse EAN.');
  const id = novoId();
  await c.env.DB.prepare('INSERT INTO produtos (id, tenant_id, ean, nome, descricao, categoria, criado_em) VALUES (?,?,?,?,?,?,?)')
    .bind(id, t, ean, b.nome.trim().slice(0, 160), b.descricao ?? null, b.categoria ?? null, agora()).run();
  return c.json({ id }, 201);
});

rotasBanco.delete('/produtos/:id', exigirPapel('dono', 'editor'), async (c) => {
  const s = c.get('sessao');
  const r = await c.env.DB.prepare('DELETE FROM produtos WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), s.tenantId).run();
  if (!r.meta.changes) return erro(c, 404, 'nao_encontrado', 'Produto não encontrado.');
  await auditar(c.env.DB, s, s.tenantId, 'produto_excluido', { id: c.req.param('id') });
  return c.json({ ok: true });
});

rotasBanco.post('/produtos/:id/imagens', exigirPapel('dono', 'editor'), async (c) => {
  const { t, mods } = await contextoVisivel(c);
  const pid = c.req.param('id')!;
  const b = await lerJson<{ asset_id: string; principal?: boolean }>(c);
  const p = await c.env.DB.prepare('SELECT 1 FROM produtos WHERE id = ? AND tenant_id = ?').bind(pid, t).first();
  const a = b?.asset_id ? await c.env.DB.prepare(`SELECT 1 FROM assets a WHERE a.id = ?3 AND a.tipo = 'produto' AND ${VISIVEL}`)
    .bind(t, mods, b.asset_id).first() : null;
  if (!p || !a) return erro(c, 404, 'nao_encontrado', 'Produto ou imagem não encontrados.');
  const ops = [];
  if (b!.principal) ops.push(c.env.DB.prepare('UPDATE produto_imagens SET principal = 0 WHERE produto_id = ?').bind(pid));
  ops.push(c.env.DB.prepare(
    `INSERT INTO produto_imagens (produto_id, asset_id, principal) VALUES (?,?,?)
     ON CONFLICT (produto_id, asset_id) DO UPDATE SET principal = excluded.principal`).bind(pid, b!.asset_id, b!.principal ? 1 : 0));
  await c.env.DB.batch(ops);
  return c.json({ ok: true, foto_id: await fotoPrincipal(c.env.DB, pid) });
});

// ── correlação ──────────────────────────────────────────────────────
interface ItemSugerir { texto: string; ean?: string }

rotasBanco.post('/banco/sugerir', async (c) => {
  const t = c.get('sessao').tenantId!;
  const b = await lerJson<{ itens: ItemSugerir[] }>(c);
  if (!b || !Array.isArray(b.itens) || b.itens.length > 200) return erro(c, 400, 'dados_invalidos', 'Envie até 200 itens.');

  // Um catálogo de supermercado cabe na memória do Worker; quando passar de
  // dezenas de milhares, troca-se por busca FTS no D1 sem mudar a resposta.
  const { results: catalogo } = await c.env.DB.prepare(
    `SELECT p.id, p.nome, p.ean,
            (SELECT asset_id FROM produto_imagens WHERE produto_id = p.id ORDER BY principal DESC LIMIT 1) AS foto_id
       FROM produtos p WHERE p.tenant_id = ? LIMIT 20000`).bind(t).all<{ id: string; nome: string; ean: string | null; foto_id: string | null }>();
  const porId = new Map(catalogo.map((p) => [p.id, p]));
  const porEan = new Map(catalogo.filter((p) => p.ean).map((p) => [p.ean!, p]));
  const tokens = catalogo.map((p) => ({ p, w: palavras(p.nome) }));
  const { results: apelidos } = await c.env.DB.prepare('SELECT apelido_normalizado, produto_id FROM produto_apelidos WHERE tenant_id = ?')
    .bind(t).all<{ apelido_normalizado: string; produto_id: string }>();
  const porApelido = new Map(apelidos.map((a) => [a.apelido_normalizado, a.produto_id]));
  const resumo = (p: { id: string; nome: string; foto_id: string | null }) => ({ id: p.id, nome: p.nome, foto_id: p.foto_id });

  const resultados = b.itens.map((it) => {
    const texto = String(it?.texto || '').slice(0, 200);
    const ean = soDigitos(it?.ean);
    if (ean && porEan.has(ean)) return { texto, status: 'ean', produto: resumo(porEan.get(ean)!) };
    const ap = porApelido.get(normalizarApelido(texto));
    if (ap && porId.has(ap)) return { texto, status: 'apelido', produto: resumo(porId.get(ap)!) };
    const q = palavras(texto);
    const candidatos = tokens
      .map(({ p, w }) => ({ ...resumo(p), pontuacao: pontuar(q, w) }))
      .filter((x) => x.pontuacao >= PONTUACAO_MINIMA)
      .sort((a, b) => b.pontuacao - a.pontuacao || (b.foto_id ? 1 : 0) - (a.foto_id ? 1 : 0))
      .slice(0, 3);
    return candidatos.length ? { texto, status: 'sugestao', candidatos } : { texto, status: 'nenhum' };
  });
  return c.json({ resultados });
});

rotasBanco.post('/banco/confirmar', exigirPapel('dono', 'editor', 'operador'), async (c) => {
  const t = c.get('sessao').tenantId!;
  const b = await lerJson<{ texto: string; produto_id: string }>(c);
  const ap = normalizarApelido(b?.texto || '');
  if (!ap || !b?.produto_id) return erro(c, 400, 'dados_invalidos', 'Informe o texto e o produto.');
  const p = await c.env.DB.prepare('SELECT 1 FROM produtos WHERE id = ? AND tenant_id = ?').bind(b.produto_id, t).first();
  if (!p) return erro(c, 404, 'nao_encontrado', 'Produto não encontrado.');
  await c.env.DB.prepare(
    `INSERT INTO produto_apelidos (tenant_id, apelido_normalizado, produto_id) VALUES (?,?,?)
     ON CONFLICT (tenant_id, apelido_normalizado) DO UPDATE SET produto_id = excluded.produto_id`)
    .bind(t, ap, b.produto_id).run();
  return c.json({ ok: true, apelido: ap });
});

// ═══ banco global (super admin) ══════════════════════════════════════
export const rotasBancoGlobal = new Hono<AppEnv>();

rotasBancoGlobal.post(ROTA_UPLOAD, async (c) => {
  const r = await receberArquivo(c, null);
  if ('falha' in r) return r.falha;
  await auditar(c.env.DB, c.get('sessao'), null, 'asset_global_criado', { id: r.id, nome: r.nome });
  return c.json(r, 201);
});

rotasBancoGlobal.delete('/assets/:id', async (c) => {
  const a = await c.env.DB.prepare('SELECT r2_chave, nome FROM assets WHERE id = ? AND tenant_id IS NULL')
    .bind(c.req.param('id')).first<{ r2_chave: string; nome: string }>();
  if (!a) return erro(c, 404, 'nao_encontrado', 'Arquivo global não encontrado.');
  await c.env.DB.prepare('DELETE FROM assets WHERE id = ? AND tenant_id IS NULL').bind(c.req.param('id')).run();
  await c.env.ARQUIVOS.delete(a.r2_chave);
  await auditar(c.env.DB, c.get('sessao'), null, 'asset_global_excluido', { nome: a.nome });
  return c.json({ ok: true });
});
