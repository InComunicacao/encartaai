// Rodapé personalizável.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { KIT_GOTHAM, KIT_PADRAO, desenharRodape, preencherTexto, type Ctx2D, type Rodape } from '../src';

const PASTA = process.env.FONTES_GOTHAM || '', SAIDA = process.env.SAIDA_RENDER || '';
const comGotham = !!PASTA && existsSync(PASTA);
beforeAll(() => { if (comGotham) for (const f of readdirSync(PASTA).filter((x) => x.endsWith('.ttf'))) GlobalFonts.registerFromPath(join(PASTA, f), f.replace('.ttf', '')); });
const kit = comGotham ? KIT_GOTHAM : KIT_PADRAO;
const R = { x: 0, y: 0, w: 1080, h: 200 };
const padrao = (): Rodape => ({ corFundo: '#0057b8', corTexto: '#ffffff', blocos: [
  { texto: 'CONSULTE LIMITE POR CPF NO APP', negrito: true, tamanho: 1 },
  { texto: 'OFERTAS VÁLIDAS DE 01/11/2026 A 07/11/2026 OU ENQUANTO DURAREM OS ESTOQUES PROMOCIONAIS NO PERÍODO ANUNCIADO.', tamanho: 0.7 },
  { texto: 'IMAGENS MERAMENTE ILUSTRATIVAS. Nos reservamos o direito de corrigir eventuais erros de digitação, informações ou valores divulgados.', tamanho: 0.5 },
] });
function desenhar(rod: Rodape) {
  const cv = createCanvas(1080, 200), ctx = cv.getContext('2d') as unknown as Ctx2D;
  let maior = 0; const orig = ctx.fillText.bind(ctx);
  // mede o corpo de cada linha escrita (pelo ctx.font do momento)
  const corpos: number[] = [], textos: string[] = [];
  (ctx as any).fillText = (t: string, x: number, y: number) => { textos.push(t); corpos.push(parseFloat(/([\d.]+)px/.exec(ctx.font)![1])); maior = Math.max(maior, y); orig(t, x, y); };
  desenharRodape(ctx, R, rod, kit);
  return { cv, corpos, textos, maior, d: cv.getContext('2d').getImageData(0, 0, 1080, 200).data };
}

describe('rodapé', () => {
  it('validade preenchida com as datas da campanha', () => {
    expect(preencherTexto('VÁLIDAS DE {de} A {ate}', { de: '2026-11-01', ate: '2026-11-07' })).toBe('VÁLIDAS DE 01/11/2026 A 07/11/2026');
    expect(preencherTexto('DE {de} A {até}', {})).toBe('DE __/__/____ A __/__/____');
    expect(preencherTexto('{loja} · {loja_texto}', { loja: 'Loja 1', lojaTexto: 'Rua A, 10' })).toBe('Loja 1 · Rua A, 10');
  });
  it('tudo cabe na faixa e o maior bloco é o maior texto', () => {
    const r = desenhar(padrao());
    expect(r.maior).toBeLessThanOrEqual(200);
    expect(r.corpos[0]).toBeGreaterThan(r.corpos[r.corpos.length - 1]);
    if (SAIDA) { mkdirSync(SAIDA, { recursive: true }); writeFileSync(join(SAIDA, 'rodape.png'), r.cv.toBuffer('image/png')); }
  });
  it('aumentar um bloco aumenta ele e não estoura', () => {
    const a = desenhar(padrao()), rod = padrao(); rod.blocos[2].tamanho = 0.8;
    const b = desenhar(rod);
    expect(b.corpos[b.corpos.length - 1]).toBeGreaterThan(a.corpos[a.corpos.length - 1]);
    expect(b.maior).toBeLessThanOrEqual(200);
  });
  it('bloco oculto não aparece; transparente não pinta o fundo', () => {
    const rod = padrao(); rod.blocos[0].oculto = true;
    expect(desenhar(rod).textos.join(' ')).not.toContain('CPF');
    expect(desenhar(padrao()).textos.join(' ')).toContain('CPF');
    const t = desenhar({ ...padrao(), transparente: true, corTexto: '#000000' });
    expect(t.d[(100 * 1080 + 5) * 4 + 3]).toBe(0);           // pixel do canto: transparente
  });
});
