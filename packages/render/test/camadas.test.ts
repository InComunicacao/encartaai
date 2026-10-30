// Camadas: ordem (atrás/frente), âncora no produto, rotação e toque.
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { ENCARTE_VERTICAL, ETIQUETA_VERMELHA, GRADES, KIT_PADRAO, caixaCamada, desenharEncarte, tocaCamada, type Camada, type Ctx2D } from '../src';

const F = ENCARTE_VERTICAL, G = GRADES['4'];
const quadrado = (cor: string) => { const c = createCanvas(100, 50), x = c.getContext('2d'); x.fillStyle = cor; x.fillRect(0, 0, 100, 50); return c as any; };
function px(camadas: Camada[], x: number, y: number, itens = [{ nome: 'Arroz', preco: '9,99' }]) {
  const cv = createCanvas(1080, 1920);
  desenharEncarte(cv.getContext('2d') as unknown as Ctx2D, { formato: F, grade: G, estilo: ETIQUETA_VERMELHA, kit: KIT_PADRAO, itens, camadas });
  return Array.from(cv.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3));
}

describe('camadas', () => {
  it('a altura segue a proporção da imagem', () => {
    const k = caixaCamada({ imagem: quadrado('#00f'), x: 0.5, y: 0.5, w: 0.2 }, F, G);
    expect(k).toMatchObject({ cx: 540, cy: 960, w: 216, h: 108 });
  });
  it('presa ao produto: a posição é relativa à célula', () => {
    const cel = G.celulas[1];
    const k = caixaCamada({ imagem: quadrado('#00f'), x: 0.5, y: 0.5, w: 0.5, ancora: 1 }, F, G);
    expect(k.cx).toBeCloseTo((cel.x + cel.w / 2) * F.w, 5);
    expect(k.w).toBeCloseTo(cel.w * F.w * 0.5, 5);
  });
  it('frente de tudo cobre a caixa de preço; atrás fica escondida por ela', () => {
    // um ponto dentro da caixa vermelha do primeiro produto
    const cel = G.celulas[0], W = cel.w * F.w;
    const x = Math.round(cel.x * F.w + W * 0.84), y = Math.round((cel.y + cel.h) * F.h - W * 0.15);
    expect(px([], x, y)).toEqual([228, 0, 16]);
    const c: Camada = { imagem: quadrado('#0000ff'), x: x / F.w, y: y / F.h, w: 0.1 };
    expect(px([c], x, y)).toEqual([0, 0, 255]);
    expect(px([{ ...c, atras: true }], x, y)).toEqual([228, 0, 16]);
    expect(px([{ ...c, oculto: true }], x, y)).toEqual([228, 0, 16]);
  });
  it('toque leva a rotação em conta', () => {
    const c: Camada = { imagem: quadrado('#00f'), x: 0.5, y: 0.5, w: 0.2 };   // 216 × 108
    expect(tocaCamada(c, F, G, 540 + 100, 960)).toBe(true);
    expect(tocaCamada(c, F, G, 540, 960 + 100)).toBe(false);
    expect(tocaCamada({ ...c, rot: 90 }, F, G, 540, 960 + 100)).toBe(true);
    expect(tocaCamada({ ...c, rot: 90 }, F, G, 540 + 100, 960)).toBe(false);
  });
});
