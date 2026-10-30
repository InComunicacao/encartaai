// Ajustes por produto: ocultar, foto, tamanhos e a caixa combinada.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ENCARTE_VERTICAL, ETIQUETA_VERMELHA, GRADES, KIT_GOTHAM, KIT_PADRAO, desenharEncarte, unitarioCombo, type Ctx2D, type Item } from '../src';

const PASTA = process.env.FONTES_GOTHAM || '', SAIDA = process.env.SAIDA_RENDER || '';
const comGotham = !!PASTA && existsSync(PASTA);
beforeAll(() => {
  if (comGotham) for (const f of readdirSync(PASTA).filter((x) => x.endsWith('.ttf'))) GlobalFonts.registerFromPath(join(PASTA, f), f.replace('.ttf', ''));
});
const kit = comGotham ? KIT_GOTHAM : KIT_PADRAO;

// Uma "foto" sólida para medir onde ela caiu.
function foto(cor = '#00ff00') {
  const c = createCanvas(200, 200), x = c.getContext('2d');
  x.fillStyle = cor; x.fillRect(0, 0, 200, 200);
  return c as any;
}
function render(itens: Item[], grade = '4') {
  const cv = createCanvas(1080, 1920);
  const r = desenharEncarte(cv.getContext('2d') as unknown as Ctx2D, { formato: ENCARTE_VERTICAL, grade: GRADES[grade], estilo: ETIQUETA_VERMELHA, kit, itens });
  return { cv, r, d: cv.getContext('2d').getImageData(0, 0, 1080, 1920).data };
}
const conta = (d: Uint8ClampedArray, f: (r: number, g: number, b: number) => boolean) => {
  let n = 0; for (let i = 0; i < d.length; i += 4) if (f(d[i], d[i + 1], d[i + 2])) n++; return n;
};
const verde = (r: number, g: number, b: number) => g > 200 && r < 60 && b < 60;
const vermelho = (r: number, g: number, b: number) => r > 200 && g < 40 && b < 50;
// centro de massa horizontal dos pixels verdes
function centroVerde(d: Uint8ClampedArray) {
  let sx = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (verde(d[i], d[i + 1], d[i + 2])) { sx += (i / 4) % 1080; n++; } return sx / n;
}
const base: Item = { nome: 'Refrigerante Cola', descricao: 'Pet 2L', preco: '9,99', fator: 'UN' };

describe('ajustes por produto', () => {
  it('produto oculto deixa a célula vazia, sem apagar da lista', () => {
    const a = render([{ ...base }]).d, b = render([{ ...base, oculto: true }]).d;
    expect(conta(a, vermelho)).toBeGreaterThan(5000);
    expect(conta(b, vermelho)).toBe(0);
  });
  it('zoom e deslocamento movem a foto', () => {
    const normal = render([{ ...base, foto: foto() }]).d;
    const zoom = render([{ ...base, foto: foto(), fotoAjuste: { dx: 0, dy: 0, escala: 0.5 } }]).d;
    const direita = render([{ ...base, foto: foto(), fotoAjuste: { dx: 0.2, dy: 0, escala: 1 } }]).d;
    expect(conta(zoom, verde)).toBeLessThan(conta(normal, verde) * 0.35);
    expect(centroVerde(direita) - centroVerde(normal)).toBeGreaterThan(40);
  });
  it('tamanho do nome e do preço por produto (com limites)', () => {
    const n = render([{ ...base }]).r[0], menor = render([{ ...base, escalaNome: 0.7, escalaPreco: 0.7 }]).r[0];
    expect(menor.corpoNome).toBeLessThan(n.corpoNome * 0.75);
    expect(menor.corpoPreco).toBeLessThan(n.corpoPreco * 0.75);
    const absurdo = render([{ ...base, escalaNome: 0.01 }]).r[0];
    expect(absurdo.corpoNome).toBeGreaterThan(n.corpoNome * 0.4);          // nunca abaixo de 0,5×
  });
});

describe('caixa combinada', () => {
  it('unitário calculado', () => {
    expect(unitarioCombo({ precoFora: '2,49', qtd: 3, preco: '5,00' })).toBe('1,67');
    expect(unitarioCombo({ precoFora: '', qtd: 2, preco: '3,00' })).toBe('1,50');
    expect(unitarioCombo({ precoFora: '', qtd: 2, preco: '3,00', unit: '1,49' })).toBe('1,49');
    expect(unitarioCombo({ precoFora: '', qtd: 0, preco: '3,00' })).toBe('');
  });
  it('desenha a coluna mais alta que a etiqueta simples', () => {
    const simples = render([{ ...base }]), combo = render([{ ...base, combo: { precoFora: '2,49', qtd: 3, preco: '5,00' } }]);
    // altura ocupada pelo vermelho na coluna da direita do primeiro card
    const alturaVermelha = (d: Uint8ClampedArray) => {
      let topo = 1920; for (let i = 0; i < d.length; i += 4) if (vermelho(d[i], d[i + 1], d[i + 2])) topo = Math.min(topo, Math.floor(i / 4 / 1080)); return topo;
    };
    expect(alturaVermelha(combo.d)).toBeLessThan(alturaVermelha(simples.d) - 80);
    if (SAIDA) { mkdirSync(SAIDA, { recursive: true }); writeFileSync(join(SAIDA, 'combo_g4.png'), combo.cv.toBuffer('image/png'));
      writeFileSync(join(SAIDA, 'combo_g9.png'), render(Array.from({ length: 9 }, (_, i) => i % 2 ? { ...base } : { ...base, combo: { precoFora: '2,49', qtd: 3, preco: '5,00' } }), '9').cv.toBuffer('image/png')); }
  });
});
