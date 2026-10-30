// Kit da marca: o nível de cima da herança de estilos
// (kit da marca → tema da campanha → ajuste da peça).
//
// Guardado como JSON, mas VALIDADO aqui: o que entra é exatamente o que o
// motor de render sabe desenhar. Campo desconhecido é descartado, cor fora
// do formato é recusada, e fonte de arquivo só vale se o cliente puder ver
// aquele arquivo — é o que impede usar a Gotham fora do plano Completo.

import { Hono } from 'hono';
import { type AppEnv, agora, erro, exigirPapel, lerJson } from '../http';
import { modulosDoTenant } from '../lib/modulos';

export const PAPEIS_FONTE = ['nome', 'descricao', 'preco', 'rodape', 'titulo'] as const;
export const PAPEIS_COR = ['primaria', 'secundaria', 'fundo', 'caixa_preco', 'texto_preco', 'caixa_descricao', 'texto_descricao', 'rodape'] as const;
const TEXTOS = ['rodape', 'validade_prefixo', 'rotulo_app', 'rotulo_fora_app', 'aviso_legal'] as const;

// Lista curada do Google Fonts para varejo. Qualquer família do catálogo
// pode ser usada; esta lista é só o que o painel mostra primeiro.
export const FONTES_SUGERIDAS = ['Anton', 'Bebas Neue', 'Oswald', 'Barlow Condensed', 'Archivo Black',
  'Montserrat', 'Poppins', 'Roboto Condensed', 'League Spartan', 'Fjalla One', 'Inter', 'Open Sans'];

const HEX = /^#[0-9a-f]{6}$/i;
const FAMILIA = /^[A-Za-z0-9 ]{2,60}$/;

interface Fonte { origem: 'google' | 'arquivo'; familia: string; asset_id?: string; peso?: number; italico?: boolean }
export interface Kit {
  fontes: Partial<Record<(typeof PAPEIS_FONTE)[number], Fonte>>;
  cores: Partial<Record<(typeof PAPEIS_COR)[number], string>>;
  textos: Partial<Record<(typeof TEXTOS)[number], string>>;
  logo_asset_id?: string | null;
}

type Validacao = { ok: true; kit: Kit; arquivos: string[] } | { ok: false; campo: string; mensagem: string };

export function validarKit(entrada: any): Validacao {
  if (!entrada || typeof entrada !== 'object') return { ok: false, campo: '', mensagem: 'Envie o kit como objeto.' };
  const kit: Kit = { fontes: {}, cores: {}, textos: {} };
  const arquivos: string[] = [];

  for (const papel of PAPEIS_FONTE) {
    const f = entrada.fontes?.[papel];
    if (f === undefined || f === null) continue;
    if (!['google', 'arquivo'].includes(f.origem)) return { ok: false, campo: `fontes.${papel}`, mensagem: 'Origem da fonte deve ser google ou arquivo.' };
    if (!FAMILIA.test(f.familia || '')) return { ok: false, campo: `fontes.${papel}`, mensagem: 'Nome de família inválido.' };
    const peso = f.peso === undefined ? undefined : Number(f.peso);
    if (peso !== undefined && (!Number.isInteger(peso) || peso < 100 || peso > 900 || peso % 100))
      return { ok: false, campo: `fontes.${papel}`, mensagem: 'Peso entre 100 e 900, de 100 em 100.' };
    const limpa: Fonte = { origem: f.origem, familia: f.familia.trim() };
    if (peso !== undefined) limpa.peso = peso;
    if (f.italico) limpa.italico = true;
    if (f.origem === 'arquivo') {
      if (typeof f.asset_id !== 'string') return { ok: false, campo: `fontes.${papel}`, mensagem: 'Fonte de arquivo precisa do asset_id.' };
      limpa.asset_id = f.asset_id;
      arquivos.push(f.asset_id);
    }
    kit.fontes[papel] = limpa;
  }
  for (const papel of PAPEIS_COR) {
    const v = entrada.cores?.[papel];
    if (v === undefined || v === null) continue;
    if (!HEX.test(v)) return { ok: false, campo: `cores.${papel}`, mensagem: 'Cor no formato #RRGGBB.' };
    kit.cores[papel] = v.toLowerCase();
  }
  for (const k of TEXTOS) {
    const v = entrada.textos?.[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string' || v.length > 2000) return { ok: false, campo: `textos.${k}`, mensagem: 'Texto de até 2000 caracteres.' };
    kit.textos[k] = v;
  }
  if (entrada.logo_asset_id !== undefined) {
    if (entrada.logo_asset_id !== null && typeof entrada.logo_asset_id !== 'string')
      return { ok: false, campo: 'logo_asset_id', mensagem: 'Logo inválida.' };
    kit.logo_asset_id = entrada.logo_asset_id;
    if (entrada.logo_asset_id) arquivos.push(entrada.logo_asset_id);
  }
  return { ok: true, kit, arquivos };
}

export const rotasKit = new Hono<AppEnv>();

rotasKit.get('/', async (c) => {
  const r = await c.env.DB.prepare('SELECT dados, atualizado_em FROM kits_marca WHERE tenant_id = ?')
    .bind(c.get('sessao').tenantId).first<{ dados: string; atualizado_em: number }>();
  return c.json({ kit: r ? JSON.parse(r.dados) : {}, atualizado_em: r?.atualizado_em ?? null, fontes_sugeridas: FONTES_SUGERIDAS });
});

rotasKit.put('/', exigirPapel('dono', 'editor'), async (c) => {
  const t = c.get('sessao').tenantId!;
  const v = validarKit(await lerJson(c));
  if (!v.ok) return erro(c, 400, 'kit_invalido', v.mensagem, { campo: v.campo });

  // Cada arquivo citado precisa ser visível para ESTE cliente: próprio, ou
  // global liberado pelos módulos dele.
  if (v.arquivos.length) {
    const mods = JSON.stringify([...(await modulosDoTenant(c.env.DB, t))]);
    for (const id of v.arquivos) {
      const ok = await c.env.DB.prepare(
        `SELECT 1 FROM assets a WHERE a.id = ?3 AND (a.tenant_id = ?1 OR (a.tenant_id IS NULL AND NOT EXISTS (
           SELECT 1 FROM json_each(a.etiquetas) e WHERE e.value LIKE 'modulo:%'
              AND substr(e.value, 8) NOT IN (SELECT value FROM json_each(?2)))))`).bind(t, mods, id).first();
      if (!ok) return erro(c, 403, 'arquivo_indisponivel', 'Uma fonte ou logo escolhida não está disponível no seu plano.', { asset_id: id });
    }
  }
  await c.env.DB.prepare(
    `INSERT INTO kits_marca (tenant_id, dados, atualizado_em) VALUES (?,?,?)
     ON CONFLICT (tenant_id) DO UPDATE SET dados = excluded.dados, atualizado_em = excluded.atualizado_em`)
    .bind(t, JSON.stringify(v.kit), agora()).run();
  return c.json({ ok: true, kit: v.kit });
});
