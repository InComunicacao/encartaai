// Edição direto no encarte: clicar seleciona (imagem solta ou produto),
// arrastar move, os cantos aumentam e a bolinha de cima gira. Arrastar
// dentro de um produto move a foto dele.
//
// O desenho continua sendo do motor (canvas); aqui é só a camada de
// interação por cima, em coordenadas do formato (1080×1920).
import { useRef, type ReactNode } from 'react';
import { ENCARTE_VERTICAL, caixaCamada, referenciaCamada, tocaCamada, type Camada, type Grade } from '@encartaai/render';
import type { CamadaApi } from './PainelCamadas';

const F = ENCARTE_VERTICAL;

interface Props {
  grade: Grade;
  camadas: CamadaApi[];
  proporcao: (assetId: string) => number;
  itemVisivel: (i: number) => boolean;
  fotoAjuste: (i: number) => { dx: number; dy: number; escala: number };
  selCamada: string | null;
  selItem: number | null;
  editavel: boolean;
  aoSelCamada: (id: string | null) => void;
  aoSelItem: (i: number | null) => void;
  aoMudarCamada: (id: string, d: Partial<CamadaApi>) => void;
  aoMoverFoto: (i: number, dx: number, dy: number) => void;
  children: ReactNode;
}

type Arrasto =
  | { modo: 'mover'; id: string; x0: number; y0: number; cx: number; cy: number; moveu: boolean }
  | { modo: 'tamanho'; id: string; w0: number; d0: number; cx: number; cy: number }
  | { modo: 'girar'; id: string; cx: number; cy: number }
  | { modo: 'foto'; i: number; x0: number; y0: number; dx: number; dy: number; moveu: boolean };

export function Palco(p: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const arr = useRef<Arrasto | null>(null);
  const motor = (c: CamadaApi): Camada => ({ ...c, imagem: null, proporcao: p.proporcao(c.asset_id) });
  const valida = (c: CamadaApi) => !c.oculto && (c.ancora == null || (!!p.grade.celulas[c.ancora] && p.itemVisivel(c.ancora)));
  const ponto = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * F.w, y: ((e.clientY - r.top) / r.height) * F.h };
  };

  function baixar(e: React.PointerEvent) {
    if (!p.editavel || e.button !== 0) return;
    const pt = ponto(e);
    const achar = (atras: boolean) => [...p.camadas].reverse().find((c) => c.atras === atras && valida(c) && tocaCamada(motor(c), F, p.grade, pt.x, pt.y));
    const c = achar(false);
    const cel = c ? -1 : p.grade.celulas.findIndex((r, i) => p.itemVisivel(i) &&
      pt.x >= r.x * F.w && pt.x <= (r.x + r.w) * F.w && pt.y >= r.y * F.h && pt.y <= (r.y + r.h) * F.h);
    const atras = !c && cel < 0 ? achar(true) : undefined;
    const alvo = c || atras;
    if (alvo) {
      p.aoSelCamada(alvo.id);
      arr.current = { modo: 'mover', id: alvo.id, x0: pt.x, y0: pt.y, cx: alvo.x, cy: alvo.y, moveu: false };
    } else if (cel >= 0) {
      p.aoSelCamada(null); p.aoSelItem(cel);
      const a = p.fotoAjuste(cel);
      arr.current = { modo: 'foto', i: cel, x0: pt.x, y0: pt.y, dx: a.dx, dy: a.dy, moveu: false };
    } else { p.aoSelCamada(null); p.aoSelItem(null); return; }
    ref.current!.setPointerCapture(e.pointerId);
  }

  function alca(e: React.PointerEvent, modo: 'tamanho' | 'girar', c: CamadaApi) {
    e.stopPropagation();
    const k = caixaCamada(motor(c), F, p.grade), pt = ponto(e);
    arr.current = modo === 'tamanho'
      ? { modo, id: c.id, w0: c.w, d0: Math.hypot(pt.x - k.cx, pt.y - k.cy) || 1, cx: k.cx, cy: k.cy }
      : { modo, id: c.id, cx: k.cx, cy: k.cy };
    ref.current!.setPointerCapture(e.pointerId);
  }

  function mover(e: React.PointerEvent) {
    const a = arr.current;
    if (!a) return;
    const pt = ponto(e);
    if (a.modo === 'mover' || a.modo === 'foto') {
      if (!a.moveu && Math.hypot(pt.x - a.x0, pt.y - a.y0) < 6) return;   // clique não é arrasto
      a.moveu = true;
    }
    if (a.modo === 'mover') {
      const c = p.camadas.find((x) => x.id === a.id); if (!c) return;
      const r = referenciaCamada(c, F, p.grade);
      p.aoMudarCamada(a.id, { x: +(a.cx + (pt.x - a.x0) / r.w).toFixed(4), y: +(a.cy + (pt.y - a.y0) / r.h).toFixed(4) });
    } else if (a.modo === 'tamanho') {
      p.aoMudarCamada(a.id, { w: +Math.min(3, Math.max(0.01, a.w0 * (Math.hypot(pt.x - a.cx, pt.y - a.cy) / a.d0))).toFixed(4) });
    } else if (a.modo === 'girar') {
      let g = (Math.atan2(pt.y - a.cy, pt.x - a.cx) * 180) / Math.PI + 90;
      if (g > 180) g -= 360;
      if (!e.shiftKey) { const im = Math.round(g / 15) * 15; if (Math.abs(im - g) < 4) g = im; }   // gruda de 15 em 15°
      p.aoMudarCamada(a.id, { rot: Math.round(g) });
    } else {
      const r = p.grade.celulas[a.i];
      p.aoMoverFoto(a.i, +(a.dx + (pt.x - a.x0) / (r.w * F.w)).toFixed(3), +(a.dy + (pt.y - a.y0) / (r.h * F.h)).toFixed(3));
    }
  }
  const soltar = () => { arr.current = null; };

  const sel = p.camadas.find((c) => c.id === p.selCamada && valida(c));
  const k = sel ? caixaCamada(motor(sel), F, p.grade) : null;
  const cel = p.selItem != null && !sel ? p.grade.celulas[p.selItem] : null;
  const pc = (v: number, t: number) => (v / t) * 100 + '%';
  return (
    <div ref={ref} className={'palco' + (p.editavel ? ' editavel' : '')} onPointerDown={baixar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
      {p.children}
      {k && sel && (
        <div className="selecao" style={{ left: pc(k.cx - k.w / 2, F.w), top: pc(k.cy - k.h / 2, F.h), width: pc(k.w, F.w), height: pc(k.h, F.h), transform: `rotate(${k.rot}deg)` }}>
          {(['no', 'ne', 'so', 'se'] as const).map((q) => <span key={q} className={'alca ' + q} onPointerDown={(e) => alca(e, 'tamanho', sel)} />)}
          <span className="girar" title="Girar" onPointerDown={(e) => alca(e, 'girar', sel)} />
        </div>
      )}
      {cel && <div className="selecao-produto" style={{ left: pc(cel.x * F.w, F.w), top: pc(cel.y * F.h, F.h), width: pc(cel.w * F.w, F.w), height: pc(cel.h * F.h, F.h) }} />}
    </div>
  );
}
