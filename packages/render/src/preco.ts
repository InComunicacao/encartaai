// O preço: inteiro grande, centavos pequenos alinhados pelo TOPO, vírgula
// pendurada embaixo dos centavos.
//
// As três proporções vêm do PSD do cliente, medidas pela v2 (ver o CSS do
// .price-linha no encarte_81): centavos = 0,562 do inteiro; a vírgula usa
// o corpo dos centavos, desce 0,378 dele e encosta 0,016 dele à direita do
// início do bloco. Aqui viram geometria de canvas em vez de CSS.

import type { Ctx2D, Fonte } from './tipos';

export const RAZAO_CENTAVOS = 0.562;
const VIRGULA_DESCE = 0.378;
const VIRGULA_RECUO = 0.016;

export interface PrecoSeparado { inteiro: string; centavos: string; digitos: number }

export function separarPreco(preco: string | number | null | undefined): PrecoSeparado {
  let v = String(preco ?? '').trim().replace(/[^\d,.]/g, '');
  if (!v) v = '0,00';
  // "1.299,90" → milhar com ponto e decimal com vírgula; "24.90" → decimal com ponto
  let int: string, cent: string;
  if (v.includes(',')) { const i = v.lastIndexOf(','); int = v.slice(0, i).replace(/\./g, ''); cent = v.slice(i + 1); }
  else if (/\.\d{1,2}$/.test(v)) { const i = v.lastIndexOf('.'); int = v.slice(0, i).replace(/\./g, ''); cent = v.slice(i + 1); }
  else { int = v.replace(/\./g, ''); cent = '00'; }
  int = int.replace(/^0+(?=\d)/, '') || '0';
  cent = (cent + '00').slice(0, 2);
  return { inteiro: int, centavos: cent, digitos: int.length };
}

export const fonteCss = (f: Fonte, px: number) => `${f.peso ?? 'normal'} ${px.toFixed(2)}px "${f.familia}"`;

export interface MedidaPreco { largura: number; altura: number }

// Mede o preço num corpo F (corpo do inteiro). Altura = altura dos dígitos
// (capHeight), que é o que ocupa a caixa — a v2 usa line-height 0,82 pelo
// mesmo motivo.
export function medirPreco(ctx: Ctx2D, p: PrecoSeparado, fonte: Fonte, F: number, capHeight: number): MedidaPreco {
  const Fc = F * RAZAO_CENTAVOS;
  ctx.font = fonteCss(fonte, F);
  const wInt = ctx.measureText(p.inteiro).width;
  ctx.font = fonteCss(fonte, Fc);
  const wCent = ctx.measureText(p.centavos).width;
  // A vírgula pendurada desce abaixo da base dos centavos, mas não da base
  // do inteiro (os centavos têm 0,562 da altura) — não soma altura.
  return { largura: wInt + wCent, altura: capHeight * F };
}

// Desenha com o canto superior esquerdo dos dígitos em (x, yTopo).
export function desenharPreco(ctx: Ctx2D, p: PrecoSeparado, fonte: Fonte, F: number, capHeight: number, x: number, yTopo: number, cor: string) {
  const Fc = F * RAZAO_CENTAVOS;
  ctx.fillStyle = cor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = fonteCss(fonte, F);
  const base = yTopo + capHeight * F;
  ctx.fillText(p.inteiro, x, base);
  const xc = x + ctx.measureText(p.inteiro).width;
  // centavos: topo dos dígitos alinhado com o topo do inteiro
  const baseC = yTopo + capHeight * Fc;
  ctx.font = fonteCss(fonte, Fc);
  ctx.fillText(p.centavos, xc, baseC);
  // vírgula: mesmo corpo dos centavos, pendurada
  ctx.fillText(',', xc + VIRGULA_RECUO * Fc, baseC + VIRGULA_DESCE * Fc);
}
