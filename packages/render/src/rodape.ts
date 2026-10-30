// Rodapé 100% personalizável: blocos de texto (cada um com tamanho,
// negrito e alinhamento), personagem à esquerda, cores próprias ou fundo
// transparente. Medido na v2: barra fina no topo, personagem, divisor
// vertical e a coluna de textos (CONSULTE LIMITE…, validade, texto legal).
//
// Todos os blocos compartilham UMA escala: o maior corpo em que o conjunto
// cabe. O "tamanho" de cada bloco é relativo a essa escala — aumentar um
// bloco reduz os outros só se não houver mais espaço.
import { maiorQueCabe } from './autofit';
import { desenharContido, quebrar } from './desenhar';
import { fonteCss } from './preco';
import type { Ctx2D, Fonte, Imagem, Kit, Retangulo } from './tipos';

export type Alinhamento = 'esquerda' | 'centro' | 'direita';
export interface BlocoRodape {
  texto: string;
  tamanho?: number;              // 0,3–3 (relativo)
  negrito?: boolean;
  alinhar?: Alinhamento;
  oculto?: boolean;
}
export interface Rodape {
  transparente?: boolean;
  corFundo?: string;
  corTexto?: string;
  corBarras?: string;            // barra do topo e divisor
  personagem?: Imagem | null;
  blocos: BlocoRodape[];
}

const ENTRELINHA = 1.12;
const ESPACO_BLOCOS = 0.35;      // em corpos do bloco de baixo

// "{de}" e "{ate}" → datas no formato brasileiro; sem data, "__/__/____".
export function preencherTexto(texto: string, v: { de?: string | null; ate?: string | null; loja?: string | null; lojaTexto?: string | null }) {
  const br = (d?: string | null) => d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '__/__/____';
  return texto.replace(/\{de\}/gi, br(v.de)).replace(/\{ate\}|\{até\}/gi, br(v.ate))
    .replace(/\{loja\}/gi, v.loja || '').replace(/\{loja_texto\}/gi, v.lojaTexto || '').replace(/[ \t]+/g, ' ').trim();
}

export function desenharRodape(ctx: Ctx2D, r: Retangulo, rod: Rodape, kit: Kit) {
  const corTexto = rod.corTexto || kit.cores.rodape_texto;
  const corBarras = rod.corBarras || corTexto;
  if (!rod.transparente) { ctx.fillStyle = rod.corFundo || kit.cores.rodape_fundo; ctx.fillRect(r.x, r.y, r.w, r.h); }
  // barra fina no topo (v2: rodape-linha-topo)
  const barra = Math.max(1, r.h * 0.025);
  ctx.fillStyle = corBarras; ctx.fillRect(r.x, r.y, r.w, barra);

  const pad = r.h * 0.1;
  let x = r.x + r.w * 0.035;
  if (rod.personagem) {
    const lado = r.h - barra - pad;
    desenharContido(ctx, rod.personagem, { x, y: r.y + barra + pad / 2, w: lado, h: lado });
    x += lado + r.h * 0.12;
    ctx.fillStyle = corBarras; ctx.fillRect(x, r.y + r.h * 0.18, Math.max(1, r.h * 0.015), r.h * 0.68);
    x += r.h * 0.12;
  }
  const area: Retangulo = { x, y: r.y + barra + pad * 0.6, w: r.x + r.w * 0.965 - x, h: r.h - barra - pad * 1.2 };
  const blocos = rod.blocos.filter((b) => !b.oculto && b.texto.trim());
  if (!blocos.length || area.w <= 0) return;

  const fonte = (b: BlocoRodape): Fonte => b.negrito ? kit.fontes.banner : kit.fontes.rodape;
  const tam = (b: BlocoRodape) => Math.min(3, Math.max(0.3, b.tamanho ?? 1));
  const montar = (base: number) => {
    let altura = 0; const out: { b: BlocoRodape; linhas: string[]; corpo: number }[] = [];
    for (const [k, b] of blocos.entries()) {
      const corpo = base * tam(b);
      const linhas = quebrar(ctx, b.texto, fonte(b), corpo, area.w, 6);
      if (!linhas) return null;
      altura += linhas.length * corpo * ENTRELINHA + (k ? corpo * ESPACO_BLOCOS : 0);
      out.push({ b, linhas, corpo });
    }
    return altura <= area.h ? { out, altura } : null;
  };
  const base = maiorQueCabe((s) => !!montar(s), area.h * 0.4, 2);
  const m = montar(base) || { out: blocos.map((b) => ({ b, linhas: [b.texto], corpo: base * tam(b) })), altura: area.h };

  let y = area.y + (area.h - m.altura) / 2;
  ctx.textBaseline = 'alphabetic'; ctx.fillStyle = corTexto;
  for (const [k, { b, linhas, corpo }] of m.out.entries()) {
    if (k) y += corpo * ESPACO_BLOCOS;
    ctx.font = fonteCss(fonte(b), corpo);
    const al = b.alinhar || 'centro';
    ctx.textAlign = al === 'esquerda' ? 'left' : al === 'direita' ? 'right' : 'center';
    const xl = al === 'esquerda' ? area.x : al === 'direita' ? area.x + area.w : area.x + area.w / 2;
    for (const l of linhas) { y += corpo * ENTRELINHA; ctx.fillText(l, xl, y - corpo * 0.28); }
  }
}
