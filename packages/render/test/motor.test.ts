// Testes do motor de render, com canvas de verdade (@napi-rs/canvas).
//
// As fontes Gotham são do cliente e não vão para o repositório: se
// FONTES_GOTHAM apontar para a pasta com os .ttf, os testes usam a fonte
// real; sem isso, usam a fonte do sistema e as regras continuam valendo.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { ENCARTE_VERTICAL, ESTILOS, ETIQUETA_VERMELHA, GRADES, KIT_PADRAO, SEM_CAIXA, blocoNomeDescricao, desenharEncarte,
  maiorQueCabe, medirPreco, quebrar, separarPreco, type Ctx2D, type Item } from '../src';

const PASTA = process.env.FONTES_GOTHAM || '';
const SAIDA = process.env.SAIDA_RENDER || '';
let ctx: Ctx2D;

beforeAll(() => {
  if (PASTA && existsSync(PASTA))
    for (const f of readdirSync(PASTA).filter((x) => x.endsWith('.ttf'))) GlobalFonts.registerFromPath(join(PASTA, f), f.replace('.ttf', ''));
  ctx = createCanvas(10, 10).getContext('2d') as unknown as Ctx2D;
});

const itens = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({
  nome: ['Arroz Tio João', 'Feijão Camil Carioca', 'Refrigerante Coca-Cola', 'Queijo Muçarela Fatiado', 'Óleo de Soja Liza',
    'Café Pilão Tradicional', 'Leite Integral Itambé', 'Açúcar Refinado União', 'Macarrão Renata', 'Biscoito Oreo',
    'Detergente Ypê', 'Papel Higiênico Neve'][i % 12],
  descricao: ['Tipo 1 5kg', 'Pacote 1kg', 'Pet 2L', 'Cada 100g', '900ml', '500g', '1L', '1kg', '500g', '90g', '500ml', '12 rolos'][i % 12],
  preco: ['24,90', '7,49', '9,99', '3,29', '6,98', '18,90', '4,79', '4,29', '3,49', '2,99', '1,89', '19,90'][i % 12],
  fator: i % 3 === 0 ? 'KG' : 'UN',
}));

describe('preço', () => {
  it('separa em todos os formatos brasileiros', () => {
    expect(separarPreco('24,90')).toEqual({ inteiro: '24', centavos: '90', digitos: 2 });
    expect(separarPreco('R$ 1.299,9')).toEqual({ inteiro: '1299', centavos: '90', digitos: 4 });
    expect(separarPreco('24.90')).toEqual({ inteiro: '24', centavos: '90', digitos: 2 });
    expect(separarPreco('7')).toEqual({ inteiro: '7', centavos: '00', digitos: 1 });
    expect(separarPreco('')).toEqual({ inteiro: '0', centavos: '00', digitos: 1 });
    expect(separarPreco('007,5')).toEqual({ inteiro: '7', centavos: '50', digitos: 1 });
  });
  it('regra de valor: num mesmo espaço, menos dígitos = preço maior', () => {
    const fonte = KIT_PADRAO.fontes.preco;
    const corpo = (p: string) => maiorQueCabe((s) => medirPreco(ctx, separarPreco(p), fonte, s, 0.7).largura <= 200, 400, 10);
    expect(corpo('9,99')).toBeGreaterThan(corpo('29,90'));
    expect(corpo('29,90')).toBeGreaterThan(corpo('129,90'));
  });
});

describe('auto-fit', () => {
  it('a busca binária acha o mesmo tamanho da linear e nunca devolve um que transborda', () => {
    for (let limiar = 5; limiar <= 300; limiar += 0.73) {
      const cabe = (s: number) => s <= limiar;
      const b = maiorQueCabe(cabe, 300, 1);
      expect(cabe(b)).toBe(true);
      expect(limiar - b).toBeLessThan(300 / 1024 + 1e-9);
    }
  });
  it('quebra por palavras e recusa palavra maior que a largura', () => {
    expect(quebrar(ctx, 'ARROZ TIO JOAO', KIT_PADRAO.fontes.nome, 20, 1000, 2)).toEqual(['ARROZ TIO JOAO']);
    expect(quebrar(ctx, 'ARROZ TIO JOAO', KIT_PADRAO.fontes.nome, 20, 70, 3)!.length).toBeGreaterThan(1);
    expect(quebrar(ctx, 'SUPERCALIFRAGILISTICO', KIT_PADRAO.fontes.nome, 40, 50, 2)).toBeNull();
  });
});

describe('hierarquia nome × descrição', () => {
  it('a descrição nunca sai maior que o nome, mesmo curta numa caixa larga', () => {
    const r = blocoNomeDescricao(ctx, { nome: 'Queijo Muçarela Fatiado Especial', descricao: '1KG', preco: '1' }, KIT_PADRAO,
      { x: 0, y: 0, w: 200, h: 60 }, 40, 0.67, 2, false);
    expect(r.corpoDescricao).toBeLessThan(r.corpoNome);
    expect(r.corpoDescricao / r.corpoNome).toBeCloseTo(0.67, 5);
  });
  it('nome comprido encolhe em vez de vazar', () => {
    const curto = blocoNomeDescricao(ctx, { nome: 'Café', preco: '1' }, KIT_PADRAO, { x: 0, y: 0, w: 200, h: 60 }, 40, 0.67, 2, false);
    const longo = blocoNomeDescricao(ctx, { nome: 'Achocolatado em Pó Nescau Radical Sabor Original', preco: '1' }, KIT_PADRAO,
      { x: 0, y: 0, w: 200, h: 60 }, 40, 0.67, 2, false);
    expect(longo.corpoNome).toBeLessThan(curto.corpoNome);
  });
});

describe('encarte inteiro', () => {
  for (const [id, grade] of Object.entries(GRADES)) {
    it(`grade de ${id}: desenha todos os produtos dentro do corpo máximo`, () => {
      const f = ENCARTE_VERTICAL, esc = 0.5;
      const cv = createCanvas(f.w * esc, f.h * esc);
      const c = cv.getContext('2d') as unknown as Ctx2D;
      const res = desenharEncarte(c, { formato: f, grade, estilo: ETIQUETA_VERMELHA, kit: KIT_PADRAO, itens: itens(grade.celulas.length) }, esc);
      expect(res).toHaveLength(grade.celulas.length);
      for (const [i, r] of res.entries()) {
        const W = grade.celulas[i].w * f.w;
        expect(r.corpoNome).toBeGreaterThan(0);
        expect(r.corpoNome).toBeLessThanOrEqual(grade.tipografia.nome * W + 1e-6);
        expect(r.corpoPreco).toBeLessThanOrEqual(grade.tipografia.preco * W + 1e-6);
      }
      if (SAIDA) { mkdirSync(SAIDA, { recursive: true }); writeFileSync(join(SAIDA, `motor_grade${id}.png`), cv.toBuffer('image/png')); }
    });
  }
  it('todos os estilos de caixa desenham sem erro, inclusive sem caixa', () => {
    for (const estilo of Object.values(ESTILOS)) {
      const cv = createCanvas(540, 960);
      const res = desenharEncarte(cv.getContext('2d') as unknown as Ctx2D,
        { formato: ENCARTE_VERTICAL, grade: GRADES['9'], estilo, kit: KIT_PADRAO, itens: itens(9) }, 0.5);
      expect(res.every((r) => r.corpoPreco > 0)).toBe(true);
      if (SAIDA) writeFileSync(join(SAIDA, `motor_estilo_${estilo.id}.png`), cv.toBuffer('image/png'));
    }
    expect(SEM_CAIXA.semCaixa).toBe(true);
  });
  it('política "mínimo" dá corpos menores que "maior"', () => {
    const corpo = (politica: 'maior' | 'minimo') => desenharEncarte(createCanvas(540, 960).getContext('2d') as unknown as Ctx2D,
      { formato: ENCARTE_VERTICAL, grade: GRADES['4'], estilo: ETIQUETA_VERMELHA, kit: KIT_PADRAO, itens: [{ nome: 'Café', preco: '9,99' }], politica }, 0.5)[0];
    expect(corpo('minimo').corpoPreco).toBeLessThan(corpo('maior').corpoPreco);
  });
});
