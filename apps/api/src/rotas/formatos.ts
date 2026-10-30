// Formatos de vídeo do cliente (painéis de LED e TVs das lojas).
//
// Validado aqui o que o motor e o codificador H.264 aceitam: lados pares
// (4:2:0), até 4096 px, área até a do 4K, rotação de 90 em 90.
import { Hono } from 'hono';
import { type AppEnv, agora, erro, exigirModulo, exigirPapel, lerJson, novoId } from '../http';

const LAYOUTS = ['card', 'faixa'], ANIMACOES = ['deslizar', 'passagem', 'surgir'], FUNDOS = ['encarte', 'arte', 'cor'];
const MAX_FORMATOS = 50;

type Validado = { ok: true; f: Record<string, unknown> } | { ok: false; campo: string; mensagem: string };

export function validarFormato(e: any): Validado {
  if (!e || typeof e !== 'object') return { ok: false, campo: '', mensagem: 'Envie o formato como objeto.' };
  const nome = String(e.nome ?? '').trim().slice(0, 80);
  if (!nome) return { ok: false, campo: 'nome', mensagem: 'Dê um nome ao formato (ex.: LED da fachada).' };
  const w = Number(e.w), h = Number(e.h);
  for (const [campo, v] of [['w', w], ['h', h]] as const) {
    if (!Number.isInteger(v) || v < 64 || v > 4096) return { ok: false, campo, mensagem: 'Largura e altura entre 64 e 4096 pixels.' };
    if (v % 2) return { ok: false, campo, mensagem: 'Use medidas pares (o vídeo MP4 exige). Ex.: 600 em vez de 601.' };
  }
  if (w * h > 3840 * 2160) return { ok: false, campo: 'w', mensagem: 'Maior que 4K: confira as medidas do painel.' };
  const rotacao = Number(e.rotacao ?? 0);
  if (![0, 90, -90].includes(rotacao)) return { ok: false, campo: 'rotacao', mensagem: 'Rotação: 0, 90 ou -90.' };
  const opc = (campo: string, lista: string[]) => {
    const v = e[campo];
    if (v === undefined || v === null || v === '') return null;
    return lista.includes(v) ? v : undefined;
  };
  const layout = opc('layout', LAYOUTS), animacao = opc('animacao', ANIMACOES), fundo = opc('fundo', FUNDOS) ?? 'arte';
  if (layout === undefined) return { ok: false, campo: 'layout', mensagem: 'Layout: card ou faixa.' };
  if (animacao === undefined) return { ok: false, campo: 'animacao', mensagem: 'Animação: deslizar, passagem ou surgir.' };
  if (fundo === undefined) return { ok: false, campo: 'fundo', mensagem: 'Fundo: encarte, arte ou cor.' };
  const num = (campo: string, min: number, max: number, inteiro: boolean) => {
    const v = e[campo];
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max || (inteiro && !Number.isInteger(n))) return undefined;
    return n;
  };
  const dur_produto = num('dur_produto', 1, 60, false), max_produtos = num('max_produtos', 1, 60, true), dur_max = num('dur_max', 2, 3600, true);
  if (dur_produto === undefined) return { ok: false, campo: 'dur_produto', mensagem: 'Segundos por produto: de 1 a 60.' };
  if (max_produtos === undefined) return { ok: false, campo: 'max_produtos', mensagem: 'Máximo de produtos: de 1 a 60.' };
  if (dur_max === undefined) return { ok: false, campo: 'dur_max', mensagem: 'Duração máxima: de 2 a 3600 segundos.' };
  const arte = e.arte_asset_id ? String(e.arte_asset_id) : null;
  return { ok: true, f: { nome, w, h, rotacao, layout, animacao, fundo, arte_asset_id: arte, dur_produto, max_produtos, dur_max } };
}

export const rotasFormatos = new Hono<AppEnv>();
rotasFormatos.use('*', exigirModulo('video'));

const COLUNAS = 'id, nome, w, h, rotacao, layout, animacao, fundo, arte_asset_id, dur_produto, max_produtos, dur_max, criado_em';

rotasFormatos.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT ${COLUNAS} FROM formatos_video WHERE tenant_id = ? ORDER BY nome`)
    .bind(c.get('sessao').tenantId).all();
  return c.json({ formatos: results });
});

// A arte precisa ser imagem de fundo/tema visível para o cliente (dele ou global).
async function arteValida(c: any, tenant: string, id: string | null) {
  if (!id) return true;
  const a = await c.env.DB.prepare(`SELECT 1 FROM assets WHERE id = ? AND tipo IN ('fundo','tema') AND (tenant_id = ? OR tenant_id IS NULL)`)
    .bind(id, tenant).first();
  return !!a;
}

rotasFormatos.post('/', exigirPapel('dono', 'editor'), async (c) => {
  const t = c.get('sessao').tenantId!;
  const v = validarFormato(await lerJson(c));
  if (!v.ok) return erro(c, 400, 'formato_invalido', v.mensagem, { campo: v.campo });
  if (!(await arteValida(c, t, v.f.arte_asset_id as string | null))) return erro(c, 400, 'arte_invalida', 'A arte precisa ser um fundo ou tema do seu banco de imagens.');
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM formatos_video WHERE tenant_id = ?').bind(t).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_FORMATOS) return erro(c, 400, 'limite', `Até ${MAX_FORMATOS} formatos por cliente.`);
  const id = novoId(), f = v.f;
  await c.env.DB.prepare(`INSERT INTO formatos_video (id, tenant_id, nome, w, h, rotacao, layout, animacao, fundo, arte_asset_id, dur_produto, max_produtos, dur_max, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, t, f.nome, f.w, f.h, f.rotacao, f.layout, f.animacao, f.fundo, f.arte_asset_id, f.dur_produto, f.max_produtos, f.dur_max, agora()).run();
  return c.json({ id }, 201);
});

rotasFormatos.put('/:id', exigirPapel('dono', 'editor'), async (c) => {
  const t = c.get('sessao').tenantId!;
  const v = validarFormato(await lerJson(c));
  if (!v.ok) return erro(c, 400, 'formato_invalido', v.mensagem, { campo: v.campo });
  if (!(await arteValida(c, t, v.f.arte_asset_id as string | null))) return erro(c, 400, 'arte_invalida', 'A arte precisa ser um fundo ou tema do seu banco de imagens.');
  const f = v.f;
  const r = await c.env.DB.prepare(`UPDATE formatos_video SET nome=?, w=?, h=?, rotacao=?, layout=?, animacao=?, fundo=?, arte_asset_id=?, dur_produto=?, max_produtos=?, dur_max=?
    WHERE id = ? AND tenant_id = ?`)
    .bind(f.nome, f.w, f.h, f.rotacao, f.layout, f.animacao, f.fundo, f.arte_asset_id, f.dur_produto, f.max_produtos, f.dur_max, c.req.param('id'), t).run();
  if (!r.meta.changes) return erro(c, 404, 'nao_encontrado', 'Formato não encontrado.');
  return c.json({ ok: true });
});

rotasFormatos.delete('/:id', exigirPapel('dono', 'editor'), async (c) => {
  const r = await c.env.DB.prepare('DELETE FROM formatos_video WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), c.get('sessao').tenantId).run();
  if (!r.meta.changes) return erro(c, 404, 'nao_encontrado', 'Formato não encontrado.');
  return c.json({ ok: true });
});
