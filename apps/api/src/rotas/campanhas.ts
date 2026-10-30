// Campanhas: o centro da EncartaAi. Encarte, vídeo, post e faixa são
// SAÍDAS da mesma campanha — por isso os itens moram aqui, e não em cada
// material.
//
// O editor salva a campanha inteira (tema + itens) de uma vez, com
// autosave. Itens são reescritos em lote num batch: não existe estado
// intermediário com metade dos produtos.

import { Hono } from 'hono';
import { type AppEnv, agora, auditar, erro, exigirModulo, exigirPapel, lerJson, novoId } from '../http';

const MAX_ITENS = 60;
const GRADES = new Set(['1', '4', '6', '8', '9', '12']);
const ESTILOS = new Set(['etiqueta_vermelha', 'etiqueta_arredondada', 'sem_caixa']);
const POLITICAS = new Set(['maior', 'medio', 'minimo']);

interface ItemEntrada {
  nome: string; descricao?: string; preco?: string; fator?: string;
  produto_id?: string | null; foto_id?: string | null; selo_id?: string | null; rotulo_app?: string | null;
  oculto?: boolean; foto_ajuste?: { dx: number; dy: number; escala: number } | null;
  escala_nome?: number | null; escala_preco?: number | null;
  combo?: { preco_fora?: string; rotulo_fora?: string; qtd?: number; preco?: string; unit?: string; rotulo?: string; rotulo_unit?: string } | null;
}
interface BlocoRodape { texto: string; tamanho: number; negrito: boolean; alinhar: string; oculto: boolean }
interface RodapeTema { transparente: boolean; cor_fundo: string | null; cor_texto: string | null; cor_barras: string | null;
  personagem_id: string | null; blocos: BlocoRodape[] }
interface CamadaTema { id: string; asset_id: string; x: number; y: number; w: number; rot: number; atras: boolean; oculto: boolean; ancora: number | null }
interface Tema { grade: string; estilo: string; politica: string; fundo_id: string | null; rodape?: RodapeTema;
  camadas?: CamadaTema[]; logo?: { escala: number; dx: number; dy: number };
  escala_nome?: number; escala_preco?: number; cores?: Record<string, string> }
const CORES_TEMA = ['caixa_preco', 'texto_preco', 'caixa_descricao', 'texto_descricao', 'banner_fundo', 'banner_texto'];
const MAX_CAMADAS = 40;
const preso = (v: unknown, min: number, max: number, padrao: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao; };
const HEX = /^#[0-9a-f]{6}$/i;
const ALINHAR = new Set(['esquerda', 'centro', 'direita']);
const MAX_BLOCOS = 8;

// Rodapé da campanha: só o que o motor desenha, com os números presos.
function validarRodape(r: any): RodapeTema | string {
  if (!r || typeof r !== 'object') return 'Rodapé inválido.';
  const cor = (v: unknown) => typeof v === 'string' && HEX.test(v) ? v : null;
  if (!Array.isArray(r.blocos) || r.blocos.length > MAX_BLOCOS) return `Rodapé: até ${MAX_BLOCOS} blocos de texto.`;
  return {
    transparente: r.transparente === true, cor_fundo: cor(r.cor_fundo), cor_texto: cor(r.cor_texto), cor_barras: cor(r.cor_barras),
    personagem_id: idOuNulo(r.personagem_id),
    blocos: r.blocos.map((b: any) => ({
      texto: texto(b?.texto, 600), tamanho: Math.min(3, Math.max(0.3, Number(b?.tamanho) || 1)), negrito: b?.negrito === true,
      alinhar: ALINHAR.has(b?.alinhar) ? b.alinhar : 'centro', oculto: b?.oculto === true,
    })),
  };
}

const texto = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : '';
const idOuNulo = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null;

export function validarTema(t: any): Tema | string {
  const tema: Tema = {
    grade: String(t?.grade ?? '9'), estilo: String(t?.estilo ?? 'etiqueta_vermelha'),
    politica: String(t?.politica ?? 'maior'), fundo_id: idOuNulo(t?.fundo_id),
  };
  if (!GRADES.has(tema.grade)) return 'Grade inválida.';
  if (!ESTILOS.has(tema.estilo)) return 'Estilo de caixa inválido.';
  if (!POLITICAS.has(tema.politica)) return 'Política de texto inválida.';
  if (t?.rodape != null) { const r = validarRodape(t.rodape); if (typeof r === 'string') return r; tema.rodape = r; }
  if (t?.camadas != null) {
    if (!Array.isArray(t.camadas) || t.camadas.length > MAX_CAMADAS) return `Até ${MAX_CAMADAS} imagens soltas por campanha.`;
    tema.camadas = [];
    for (const c of t.camadas) {
      const asset = idOuNulo(c?.asset_id);
      if (!asset) return 'Imagem solta sem arquivo.';
      const ancora = c?.ancora == null ? null : Number(c.ancora);
      tema.camadas.push({ id: texto(c?.id, 40) || crypto.randomUUID(), asset_id: asset,
        x: preso(c?.x, -0.5, 1.5, 0.5), y: preso(c?.y, -0.5, 1.5, 0.5), w: preso(c?.w, 0.01, 3, 0.2), rot: preso(c?.rot, -360, 360, 0),
        atras: c?.atras === true, oculto: c?.oculto === true,
        ancora: ancora != null && Number.isInteger(ancora) && ancora >= 0 && ancora < MAX_ITENS ? ancora : null });
    }
  }
  if (t?.escala_nome != null) tema.escala_nome = preso(t.escala_nome, 0.5, 1.5, 1);
  if (t?.escala_preco != null) tema.escala_preco = preso(t.escala_preco, 0.5, 1.5, 1);
  if (t?.cores != null && typeof t.cores === 'object') {
    tema.cores = {};
    for (const k of CORES_TEMA) if (typeof t.cores[k] === 'string' && HEX.test(t.cores[k])) tema.cores[k] = t.cores[k];
  }
  if (t?.logo != null) tema.logo = { escala: preso(t.logo?.escala, 0.3, 3, 1), dx: preso(t.logo?.dx, -1, 1, 0), dy: preso(t.logo?.dy, -1, 1, 0) };
  return tema;
}

const num = (v: unknown, min: number, max: number, padrao: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};

// Só entra o que o motor sabe desenhar; números presos nos limites dele.
function limparItem(i: ItemEntrada) {
  const a = i.foto_ajuste, c = i.combo;
  return {
    nome: texto(i.nome, 120), descricao: texto(i.descricao, 120), preco: texto(i.preco, 20), fator: texto(i.fator, 20),
    produto_id: idOuNulo(i.produto_id), foto_id: idOuNulo(i.foto_id), selo_id: idOuNulo(i.selo_id),
    rotulo_app: i.rotulo_app ? texto(i.rotulo_app, 40) : null,
    oculto: i.oculto === true,
    foto_ajuste: a && typeof a === 'object' ? { dx: num(a.dx, -1, 1, 0), dy: num(a.dy, -1, 1, 0), escala: num(a.escala, 0.2, 3, 1) } : null,
    escala_nome: i.escala_nome == null ? null : num(i.escala_nome, 0.5, 1.5, 1),
    escala_preco: i.escala_preco == null ? null : num(i.escala_preco, 0.5, 1.5, 1),
    combo: c && typeof c === 'object' ? {
      preco_fora: texto(c.preco_fora, 20), rotulo_fora: texto(c.rotulo_fora, 40), qtd: Math.round(num(c.qtd, 1, 99, 2)),
      preco: texto(c.preco, 20), unit: texto(c.unit, 20), rotulo: texto(c.rotulo, 40), rotulo_unit: texto(c.rotulo_unit, 60),
    } : null,
  };
}

export const rotasCampanhas = new Hono<AppEnv>();
rotasCampanhas.use('*', exigirModulo('encarte'));

rotasCampanhas.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.nome, c.loja_id, l.nome AS loja_nome, c.validade_de, c.validade_ate, c.tema, c.atualizado_em,
            (SELECT COUNT(*) FROM campanha_itens i WHERE i.campanha_id = c.id) AS itens
       FROM campanhas c LEFT JOIN lojas l ON l.id = c.loja_id
      WHERE c.tenant_id = ? ORDER BY c.atualizado_em DESC LIMIT 200`).bind(c.get('sessao').tenantId).all<any>();
  return c.json({ campanhas: results.map((r) => ({ ...r, tema: JSON.parse(r.tema) })) });
});

rotasCampanhas.post('/', exigirPapel('dono', 'editor'), async (c) => {
  const s = c.get('sessao');
  const b = await lerJson<{ nome: string; loja_id?: string; tema?: unknown; duplicar_de?: string }>(c);
  const nome = texto(b?.nome, 120).trim();
  if (!nome) return erro(c, 400, 'dados_invalidos', 'Dê um nome à campanha.');
  const id = novoId(), t0 = agora();

  // "Salvar como": a dor mais frequente do uso semanal na v2.
  if (b?.duplicar_de) {
    const orig = await c.env.DB.prepare('SELECT loja_id, tema, validade_de, validade_ate FROM campanhas WHERE id = ? AND tenant_id = ?')
      .bind(b.duplicar_de, s.tenantId).first<any>();
    if (!orig) return erro(c, 404, 'nao_encontrado', 'Campanha de origem não encontrada.');
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO campanhas (id, tenant_id, loja_id, nome, validade_de, validade_ate, tema, criado_por, criado_em, atualizado_em)
                        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, s.tenantId, orig.loja_id, nome, orig.validade_de, orig.validade_ate, orig.tema, s.usuarioId, t0, t0),
      c.env.DB.prepare(`INSERT INTO campanha_itens (id, campanha_id, tenant_id, ordem, produto_id, dados)
                        SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-a' ||
                               substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))), ?, tenant_id, ordem, produto_id, dados
                          FROM campanha_itens WHERE campanha_id = ? AND tenant_id = ?`).bind(id, b.duplicar_de, s.tenantId),
    ]);
    return c.json({ id }, 201);
  }

  const tema = validarTema(b?.tema ?? {});
  if (typeof tema === 'string') return erro(c, 400, 'tema_invalido', tema);
  const loja = b?.loja_id ? await c.env.DB.prepare('SELECT id FROM lojas WHERE id = ? AND tenant_id = ?').bind(b.loja_id, s.tenantId).first() : null;
  await c.env.DB.prepare(`INSERT INTO campanhas (id, tenant_id, loja_id, nome, tema, criado_por, criado_em, atualizado_em)
                          VALUES (?,?,?,?,?,?,?,?)`)
    .bind(id, s.tenantId, loja ? b!.loja_id : null, nome, JSON.stringify(tema), s.usuarioId, t0, t0).run();
  return c.json({ id }, 201);
});

rotasCampanhas.get('/:id', async (c) => {
  const t = c.get('sessao').tenantId;
  const camp = await c.env.DB.prepare(
    `SELECT c.id, c.nome, c.loja_id, c.validade_de, c.validade_ate, c.tema, c.atualizado_em, l.logo_asset_id AS loja_logo_id
       FROM campanhas c LEFT JOIN lojas l ON l.id = c.loja_id WHERE c.id = ? AND c.tenant_id = ?`)
    .bind(c.req.param('id'), t).first<any>();
  if (!camp) return erro(c, 404, 'nao_encontrado', 'Campanha não encontrada.');
  const { results } = await c.env.DB.prepare('SELECT dados FROM campanha_itens WHERE campanha_id = ? AND tenant_id = ? ORDER BY ordem')
    .bind(camp.id, t).all<{ dados: string }>();
  return c.json({ campanha: { ...camp, tema: JSON.parse(camp.tema), itens: results.map((r) => JSON.parse(r.dados)) } });
});

// Salva a campanha inteira. `versao` (o atualizado_em lido) evita que um
// autosave antigo apague o que outro computador do mesmo cliente salvou.
rotasCampanhas.put('/:id', exigirPapel('dono', 'editor', 'operador'), async (c) => {
  const s = c.get('sessao');
  const id = c.req.param('id');
  const b = await lerJson<{ nome?: string; loja_id?: string | null; validade_de?: string | null; validade_ate?: string | null;
    tema?: unknown; itens?: ItemEntrada[]; versao?: number }>(c);
  if (!b) return erro(c, 400, 'dados_invalidos', 'Corpo vazio.');
  const atual = await c.env.DB.prepare('SELECT atualizado_em FROM campanhas WHERE id = ? AND tenant_id = ?').bind(id, s.tenantId)
    .first<{ atualizado_em: number }>();
  if (!atual) return erro(c, 404, 'nao_encontrado', 'Campanha não encontrada.');
  if (b.versao !== undefined && b.versao !== atual.atualizado_em)
    return erro(c, 409, 'versao_antiga', 'Esta campanha foi alterada em outro lugar. Recarregue para ver a versão mais nova.');

  // Operador só mexe nos itens (preços), não no tema nem no nome.
  if (s.papel === 'operador' && (b.nome !== undefined || b.tema !== undefined || b.loja_id !== undefined))
    return erro(c, 403, 'sem_permissao', 'Seu perfil só atualiza os produtos e preços.');

  let tema: Tema | null = null;
  if (b.tema !== undefined) { const v = validarTema(b.tema); if (typeof v === 'string') return erro(c, 400, 'tema_invalido', v); tema = v; }
  if (b.loja_id) {
    const ok = await c.env.DB.prepare('SELECT 1 FROM lojas WHERE id = ? AND tenant_id = ?').bind(b.loja_id, s.tenantId).first();
    if (!ok) return erro(c, 400, 'loja_invalida', 'Loja não encontrada.');
  }
  const data = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const t1 = Math.max(agora(), atual.atualizado_em + 1);
  const ops = [c.env.DB.prepare(
    `UPDATE campanhas SET nome = COALESCE(?, nome), tema = COALESCE(?, tema),
            loja_id = CASE WHEN ? THEN ? ELSE loja_id END,
            validade_de = CASE WHEN ? THEN ? ELSE validade_de END, validade_ate = CASE WHEN ? THEN ? ELSE validade_ate END,
            atualizado_em = ? WHERE id = ? AND tenant_id = ?`)
    .bind(b.nome ? texto(b.nome, 120) : null, tema ? JSON.stringify(tema) : null,
      b.loja_id !== undefined ? 1 : 0, b.loja_id || null,
      b.validade_de !== undefined ? 1 : 0, data(b.validade_de), b.validade_ate !== undefined ? 1 : 0, data(b.validade_ate),
      t1, id, s.tenantId)];
  if (b.itens !== undefined) {
    if (!Array.isArray(b.itens) || b.itens.length > MAX_ITENS) return erro(c, 400, 'itens_invalidos', `Até ${MAX_ITENS} produtos por campanha.`);
    ops.push(c.env.DB.prepare('DELETE FROM campanha_itens WHERE campanha_id = ? AND tenant_id = ?').bind(id, s.tenantId));
    b.itens.forEach((i, ordem) => {
      const limpo = limparItem(i);
      ops.push(c.env.DB.prepare('INSERT INTO campanha_itens (id, campanha_id, tenant_id, ordem, produto_id, dados) VALUES (?,?,?,?,?,?)')
        .bind(novoId(), id, s.tenantId, ordem, null, JSON.stringify(limpo)));
    });
  }
  await c.env.DB.batch(ops);
  return c.json({ ok: true, versao: t1 });
});

rotasCampanhas.delete('/:id', exigirPapel('dono', 'editor'), async (c) => {
  const s = c.get('sessao');
  const r = await c.env.DB.prepare('DELETE FROM campanhas WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), s.tenantId).run();
  if (!r.meta.changes) return erro(c, 404, 'nao_encontrado', 'Campanha não encontrada.');
  await auditar(c.env.DB, s, s.tenantId, 'campanha_excluida', { id: c.req.param('id') });
  return c.json({ ok: true });
});
