// Camadas: imagens soltas por cima (ou por trás) dos produtos — selos,
// personagens, artes, a segunda foto de um produto. Na v2 eram as
// "imagens soltas", com "frente de tudo", "atrás dos produtos" e
// subir/descer nível.
//
// Posição em FRAÇÕES: do encarte inteiro, ou da célula do produto quando a
// camada está presa a ele (âncora) — trocar a grade leva a camada junto.
import type { Formato, Grade, Imagem, Retangulo } from './tipos';

export interface Camada {
  imagem: Imagem | null;
  x: number; y: number;          // centro, em fração da área de referência
  w: number;                     // largura, em fração da largura da referência
  rot?: number;                  // graus
  atras?: boolean;               // atrás dos produtos (senão, frente de tudo)
  oculto?: boolean;
  ancora?: number | null;        // índice do produto (célula) a que está presa
  proporcao?: number;            // altura/largura quando a imagem ainda não carregou
}

// A área a que as frações se referem.
export function referenciaCamada(c: Pick<Camada, 'ancora'>, f: Formato, g: Grade): Retangulo {
  const cel = c.ancora != null ? g.celulas[c.ancora] : null;
  return cel ? { x: cel.x * f.w, y: cel.y * f.h, w: cel.w * f.w, h: cel.h * f.h } : { x: 0, y: 0, w: f.w, h: f.h };
}

// Centro, largura e altura em pixels do formato (antes da rotação).
export function caixaCamada(c: Camada, f: Formato, g: Grade) {
  const r = referenciaCamada(c, f, g);
  const prop = c.imagem && c.imagem.width ? c.imagem.height / c.imagem.width : (c.proporcao ?? 1);
  const w = c.w * r.w;
  return { cx: r.x + c.x * r.w, cy: r.y + c.y * r.h, w, h: w * prop, rot: c.rot ?? 0 };
}

// O ponto (px do formato) está dentro da camada? Leva a rotação em conta.
export function tocaCamada(c: Camada, f: Formato, g: Grade, px: number, py: number) {
  const k = caixaCamada(c, f, g), a = (-k.rot * Math.PI) / 180;
  const dx = px - k.cx, dy = py - k.cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= k.w / 2 && Math.abs(ly) <= k.h / 2;
}
