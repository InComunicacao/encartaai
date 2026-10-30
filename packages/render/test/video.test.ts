// Vídeo: a animação é função pura do tempo, e cada formato desenha.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ETIQUETA_VERMELHA, FORMATOS_VIDEO_PADRAO, KIT_GOTHAM, KIT_PADRAO, SEM_CAIXA, VIDEO_FPS, desenharQuadroVideo, dimensaoCena,
  duracaoVideo, estadoNoInstante, layoutDe, limiteProdutos, totalQuadros, type CenaVideo, type Ctx2D, type FormatoVideo, type Item } from '../src';

const PASTA = process.env.FONTES_GOTHAM || '';
const SAIDA = process.env.SAIDA_RENDER || '';
const comGotham = !!PASTA && existsSync(PASTA);
beforeAll(() => {
  if (comGotham) for (const f of readdirSync(PASTA).filter((x) => x.endsWith('.ttf'))) GlobalFonts.registerFromPath(join(PASTA, f), f.replace('.ttf', ''));
});

const itens: Item[] = [
  { nome: 'Arroz Tio João', descricao: 'Tipo 1 5kg', preco: '24,90', fator: 'UN' },
  { nome: 'Queijo Muçarela Fatiado', descricao: 'Cada 100g', preco: '3,29', fator: 'KG' },
  { nome: 'Refrigerante Coca-Cola', descricao: 'Pet 2L', preco: '9,99' },
];
const kit = comGotham ? KIT_GOTHAM : KIT_PADRAO;
const cena = (formato: FormatoVideo, extra: Partial<CenaVideo> = {}): CenaVideo =>
  ({ formato, kit, estilo: ETIQUETA_VERMELHA, itens, fundo: 'cor', corFundo: '#0f9f4f', ...extra });

// Conta pixels "vermelho da caixa de preço" numa imagem.
function vermelhos(d: Uint8ClampedArray) {
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 40 && d[i + 2] < 50) n++;
  return n;
}
function desenhar(c: CenaVideo, t: number) {
  const cv = createCanvas(c.formato.w, c.formato.h);
  const ctx = cv.getContext('2d') as unknown as Ctx2D;
  desenharQuadroVideo(ctx, c, t);
  return cv;
}

describe('tempo da animação', () => {
  it('deslizar: entra pela direita, para no meio, sai pela esquerda', () => {
    expect(estadoNoInstante(0, 3, 5, 'deslizar')).toEqual({ indice: 0, dx: 1, alfa: 0 });
    expect(estadoNoInstante(2.5, 3, 5, 'deslizar')).toEqual({ indice: 0, dx: 0, alfa: 1 });
    const saindo = estadoNoInstante(4.9, 3, 5, 'deslizar')!;
    expect(saindo.indice).toBe(0); expect(saindo.dx).toBeLessThan(0); expect(saindo.alfa).toBeLessThan(1);
    expect(estadoNoInstante(5.1, 3, 5, 'deslizar')!.indice).toBe(1);
    expect(estadoNoInstante(999, 3, 5, 'deslizar')!.indice).toBe(2);
  });
  it('passagem: linear, opaca, tela vazia entre um produto e outro', () => {
    expect(estadoNoInstante(0.01, 3, 5, 'passagem')).toBeNull();
    expect(estadoNoInstante(4.99, 3, 5, 'passagem')).toBeNull();
    const a = estadoNoInstante(0.05 + 0.21, 3, 5, 'passagem')!;
    expect(a.alfa).toBe(1); expect(a.dx).toBeCloseTo(0.5, 5);
    expect(estadoNoInstante(2.5, 3, 5, 'passagem')!.dx).toBe(0);
    expect(estadoNoInstante(5 - 0.05 - 0.21, 3, 5, 'passagem')!.dx).toBeCloseTo(0.5, 5);   // sai pela DIREITA
  });
  it('surgir: só opacidade', () => {
    expect(estadoNoInstante(0, 1, 5, 'surgir')!.alfa).toBe(0);
    expect(estadoNoInstante(2.5, 1, 5, 'surgir')).toEqual({ indice: 0, dx: 0, alfa: 1 });
  });
  it('duração exata: produtos × segundos, a 30 quadros por segundo', () => {
    const c = cena(FORMATOS_VIDEO_PADRAO[0], { durProduto: 4 });
    expect(duracaoVideo(c)).toBe(12);
    expect(totalQuadros(c)).toBe(12 * VIDEO_FPS);
  });
  it('limites do painel: máximo de produtos e de duração', () => {
    const painel: FormatoVideo = { id: 'p', nome: 'p', grupo: 'g', w: 720, h: 480, fundo: 'cor', maxProdutos: 6, durMax: 20 };
    expect(limiteProdutos(painel, 5)).toBe(4);
    expect(limiteProdutos(painel, 3)).toBe(6);
    expect(limiteProdutos({ ...painel, maxProdutos: undefined, durMax: undefined }, 5)).toBe(60);
  });
});

describe('formatos', () => {
  it('todos os de fábrica têm lados pares (H.264 4:2:0)', () => {
    for (const f of FORMATOS_VIDEO_PADRAO) { expect(f.w % 2).toBe(0); expect(f.h % 2).toBe(0); }
  });
  it('TV girada desenha em pé e o arquivo sai deitado', () => {
    const tv = FORMATOS_VIDEO_PADRAO.find((f) => f.id === 'tv_vertical')!;
    expect(dimensaoCena(tv)).toEqual({ w: 1080, h: 1920 });
  });
  it('layout pela proporção: faixa comprida vira "faixa", o resto "card"', () => {
    expect(layoutDe(FORMATOS_VIDEO_PADRAO.find((f) => f.id === 'led_faixa')!)).toBe('faixa');
    expect(layoutDe(FORMATOS_VIDEO_PADRAO.find((f) => f.id === 'led_quadrado')!)).toBe('card');
    expect(layoutDe({ id: 'x', nome: 'x', grupo: 'g', w: 2502, h: 208, fundo: 'cor' })).toBe('faixa');
  });

  for (const f of FORMATOS_VIDEO_PADRAO) {
    it(`${f.nome}: produto aparece no meio do tempo e some na tela vazia`, () => {
      const c = cena(f, { fundo: f.fundo === 'encarte' ? 'encarte' : 'cor' });
      const meio = desenhar(c, 2.5);
      const d = meio.getContext('2d').getImageData(0, 0, f.w, f.h).data;
      expect(vermelhos(d)).toBeGreaterThan(f.w * f.h * 0.01);      // a caixa de preço está lá
      if (SAIDA) { mkdirSync(SAIDA, { recursive: true }); writeFileSync(join(SAIDA, `video_${f.id}.png`), meio.toBuffer('image/png')); }
      const vazio = desenhar({ ...c, animacao: 'passagem' }, 0.01).getContext('2d').getImageData(0, 0, f.w, f.h).data;
      expect(vermelhos(vazio)).toBeLessThan(f.w * f.h * 0.002);
    });
  }

  it('TV girada: o conteúdo em pé fica girado no arquivo (topo da cena à esquerda)', () => {
    const tv = FORMATOS_VIDEO_PADRAO.find((f) => f.id === 'tv_vertical')!;
    // rodapé do encarte (azul do kit Gotham / escuro no padrão) fica na BASE da cena;
    // com -90°, a base da cena vai para a DIREITA do arquivo.
    const cv = desenhar(cena(tv, { fundo: 'encarte' }), 2.5);
    const px = (x: number, y: number) => Array.from(cv.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3));
    const rod = kit.cores.rodape_fundo.match(/\w\w/g)!.map((h) => parseInt(h, 16));
    const perto = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 12);
    expect(perto(px(1900, 540), rod)).toBe(true);
    expect(perto(px(20, 540), rod)).toBe(false);
  });

  it('sem caixa também desenha (texto com contorno sobre a arte)', () => {
    const f = FORMATOS_VIDEO_PADRAO.find((x) => x.id === 'led_faixa')!;
    const cv = desenhar(cena(f, { estilo: SEM_CAIXA }), 2.5);
    expect(cv.width).toBe(1920);
  });
});
