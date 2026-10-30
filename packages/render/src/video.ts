// Vídeo e LED: um produto por vez, entrando e saindo, sobre um fundo.
//
// Tudo aqui é função do TEMPO: desenharQuadroVideo(ctx, cena, t) desenha o
// instante t (em segundos) e nada mais. A prévia chama com o relógio; a
// gravação chama com i / FPS, quadro a quadro — por isso o MP4 sai com a
// duração exata e sem quadros pulados, mesmo num computador lento (o bug
// do vídeo "que não abre" da v2 vinha da gravação em tempo real).
//
// Formatos são DADOS, não código: tamanho, rotação, layout e limites. Os
// de fábrica estão abaixo; cada cliente cadastra os painéis dele.
import { desenharCard, desenharEncarte, blocoNomeDescricao, desenharCobrindo, desenharContido, linhaAjustada } from './desenhar';
import { alturaDigitos, desenharPreco, medirPreco, separarPreco } from './preco';
import { maiorQueCabe } from './autofit';
import { ENCARTE_VERTICAL, GRADES } from './padroes';
import type { EstiloCaixa } from './estilos';
import type { Ctx2D, Imagem, Item, Kit, PoliticaTexto, Retangulo } from './tipos';

export const VIDEO_FPS = 30;

export type AnimacaoVideo = 'deslizar' | 'passagem' | 'surgir';
export type LayoutVideo = 'card' | 'faixa';
export type FundoVideo = 'encarte' | 'arte' | 'cor';

export interface FormatoVideo {
  id: string;
  nome: string;
  grupo: string;
  w: number;                       // tamanho do ARQUIVO (pares: exigência do H.264)
  h: number;
  rotacao?: 0 | 90 | -90;          // TV instalada de lado: desenha em pé e gira na saída
  fundo: FundoVideo;               // sugestão; o usuário pode trocar
  layout?: LayoutVideo;            // sem valor: decide pela proporção
  animacao?: AnimacaoVideo;
  durProduto?: number;             // segundos por produto
  maxProdutos?: number;
  durMax?: number;                 // segundos; limite do painel
  arteId?: string | null;          // arte de fundo própria do painel (banco de imagens)
  descricao?: string;
}

// Os de fábrica. Os painéis de cada loja o cliente cadastra (tamanho em
// pixels que o fornecedor do LED informa).
export const FORMATOS_VIDEO_PADRAO: FormatoVideo[] = [
  { id: 'stories', nome: 'Stories e Reels', grupo: 'Redes sociais', w: 1080, h: 1920, fundo: 'encarte',
    descricao: 'Vertical, com o fundo da campanha, a logo da loja e o rodapé.' },
  { id: 'tv_horizontal', nome: 'TV horizontal', grupo: 'TV', w: 1920, h: 1080, fundo: 'cor',
    descricao: 'Full HD, para TV comum na parede.' },
  { id: 'tv_vertical', nome: 'TV em pé (girada)', grupo: 'TV', w: 1920, h: 1080, rotacao: -90, fundo: 'encarte',
    descricao: 'Para TV instalada de lado: o arquivo sai girado e aparece em pé.' },
  { id: 'led_quadrado', nome: 'LED quadrado', grupo: 'Painéis de LED', w: 1080, h: 1080, fundo: 'cor' },
  { id: 'led_faixa', nome: 'LED faixa', grupo: 'Painéis de LED', w: 1920, h: 320, fundo: 'cor', animacao: 'passagem',
    descricao: 'Faixa comprida: foto, nome e preço lado a lado.' },
];

export const DUR_PRODUTO_PADRAO = 5;
const DUR_SLIDE = 0.5;
// "passagem": medida no vídeo de um cliente — linear, sem fade, entra e sai
// pelo mesmo lado, com uma batida de tela limpa entre um produto e outro.
const PASSAGEM = { entrada: 0.42, saida: 0.42, vazio: 0.10 };

export function layoutDe(f: FormatoVideo): LayoutVideo {
  if (f.layout) return f.layout;
  const c = dimensaoCena(f);
  return c.w / c.h >= 2.6 ? 'faixa' : 'card';
}

// Dimensão em que a cena é desenhada (antes da rotação).
export function dimensaoCena(f: FormatoVideo): { w: number; h: number } {
  return f.rotacao ? { w: f.h, h: f.w } : { w: f.w, h: f.h };
}

// Quantos produtos cabem, pelos limites do painel.
export function limiteProdutos(f: FormatoVideo, durProduto: number): number {
  let n = f.maxProdutos ?? 60;
  if (f.durMax) n = Math.min(n, Math.max(1, Math.floor(f.durMax / durProduto + 1e-9)));
  return n;
}

export interface EstadoQuadro { indice: number; dx: number; alfa: number }

// Onde o produto está no instante t. dx é fração da largura da cena
// (positivo = à direita). null = tela vazia (só o fundo).
export function estadoNoInstante(t: number, n: number, dur: number, anim: AnimacaoVideo): EstadoQuadro | null {
  if (n <= 0) return null;
  const indice = Math.min(Math.max(0, Math.floor(t / dur)), n - 1);
  const r = t - indice * dur;
  if (anim === 'passagem') {
    const meio = PASSAGEM.vazio / 2;
    if (r < meio || r >= dur - meio) return null;
    if (r < meio + PASSAGEM.entrada) return { indice, dx: 1 - (r - meio) / PASSAGEM.entrada, alfa: 1 };
    const saida = dur - meio - PASSAGEM.saida;
    if (r >= saida) return { indice, dx: (r - saida) / PASSAGEM.saida, alfa: 1 };
    return { indice, dx: 0, alfa: 1 };
  }
  if (anim === 'surgir') {
    const a = Math.min(1, r / DUR_SLIDE, (dur - r) / DUR_SLIDE);
    return { indice, dx: 0, alfa: Math.max(0, a) };
  }
  if (r < DUR_SLIDE) {
    const e = 1 - Math.pow(1 - r / DUR_SLIDE, 3);               // easeOutCubic
    return { indice, dx: 1 - e, alfa: e };
  }
  if (r > dur - DUR_SLIDE) {
    const e = Math.pow((r - (dur - DUR_SLIDE)) / DUR_SLIDE, 3); // easeInCubic
    return { indice, dx: -e, alfa: 1 - e };
  }
  return { indice, dx: 0, alfa: 1 };
}

export interface CenaVideo {
  formato: FormatoVideo;
  kit: Kit;
  estilo: EstiloCaixa;
  politica?: PoliticaTexto;
  itens: Item[];
  fundo: FundoVideo;
  fundoImagem?: Imagem | null;     // tema da campanha (encarte) ou arte do painel
  corFundo?: string;
  logo?: Imagem | null;
  durProduto?: number;
  animacao?: AnimacaoVideo;
}

export const duracaoVideo = (c: CenaVideo) => c.itens.length * (c.durProduto ?? c.formato.durProduto ?? DUR_PRODUTO_PADRAO);
export const totalQuadros = (c: CenaVideo) => Math.round(duracaoVideo(c) * VIDEO_FPS);

// Área onde o produto entra, em coordenadas da cena.
function areaProduto(c: CenaVideo, cena: { w: number; h: number }, enc: { e: number; ox: number; oy: number } | null): Retangulo {
  if (enc) {
    // Entre a logo e o rodapé do encarte, com folga (medido na v2: 610–1700).
    const f = ENCARTE_VERTICAL;
    const topo = (f.logo.y + f.logo.h) * f.h + 47, base = f.rodape.y * f.h - 20;
    const largura = f.w * 0.84;
    return { x: enc.ox + (f.w - largura) / 2 * enc.e, y: enc.oy + topo * enc.e, w: largura * enc.e, h: (base - topo) * enc.e };
  }
  const pad = Math.round(Math.min(cena.w, cena.h) * (layoutDe(c.formato) === 'faixa' ? 0.06 : 0.07));
  return { x: pad, y: pad, w: cena.w - 2 * pad, h: cena.h - 2 * pad };
}

// A proporção do card de 1 produto do encarte (largura / altura).
const G1 = GRADES['1'];
const PROPORCAO_CARD = (G1.celulas[0].w * ENCARTE_VERTICAL.w) / (G1.celulas[0].h * ENCARTE_VERTICAL.h);

export function desenharQuadroVideo(ctx: Ctx2D, c: CenaVideo, t: number) {
  const f = c.formato, cena = dimensaoCena(f);
  const dur = c.durProduto ?? f.durProduto ?? DUR_PRODUTO_PADRAO;
  ctx.save();
  if (f.rotacao) {
    ctx.translate(f.w / 2, f.h / 2);
    ctx.rotate((f.rotacao * Math.PI) / 180);
    ctx.translate(-cena.w / 2, -cena.h / 2);
  }

  // ── fundo
  let enc: { e: number; ox: number; oy: number } | null = null;
  ctx.fillStyle = c.corFundo || '#ffffff';
  ctx.fillRect(0, 0, cena.w, cena.h);
  if (c.fundo === 'encarte') {
    // O encarte inteiro sem os produtos (fundo + logo + rodapé), cobrindo a cena.
    const E = ENCARTE_VERTICAL, e = Math.max(cena.w / E.w, cena.h / E.h);
    enc = { e, ox: (cena.w - E.w * e) / 2, oy: (cena.h - E.h * e) / 2 };
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cena.w, cena.h); ctx.clip();
    ctx.translate(enc.ox, enc.oy);
    desenharEncarte(ctx, { formato: E, grade: G1, estilo: c.estilo, kit: c.kit, itens: [], fundo: c.fundoImagem, logo: c.logo }, e);
    ctx.restore();
  } else if (c.fundo === 'arte' && c.fundoImagem) {
    desenharCobrindo(ctx, c.fundoImagem, { x: 0, y: 0, w: cena.w, h: cena.h });
  }

  // ── produto
  const est = estadoNoInstante(t, c.itens.length, dur, c.animacao ?? f.animacao ?? 'deslizar');
  if (est && est.alfa > 0.001) {
    const item = c.itens[est.indice];
    const area = areaProduto(c, cena, enc);
    ctx.save();
    ctx.globalAlpha = est.alfa;
    // O percurso é o que falta para a borda esquerda da área chegar à
    // direita da cena — nem mais (sairia rápido demais), nem menos.
    ctx.translate(est.dx * (cena.w - area.x), 0);
    if (layoutDe(f) === 'faixa' && !enc) desenharFaixa(ctx, area, item, c.kit, c.estilo);
    else {
      // card do encarte de 1 produto, no maior tamanho que cabe na área
      let w = area.w, h = w / PROPORCAO_CARD;
      if (h > area.h) { h = area.h; w = h * PROPORCAO_CARD; }
      desenharCard(ctx, { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h }, item, c.kit, G1, c.estilo, c.politica);
    }
    ctx.restore();
  }
  ctx.restore();
}

// ── faixa ───────────────────────────────────────────────────────────
// Painel comprido e baixo (LED de gôndola, fachada): foto · nome · preço
// lado a lado. Mesmas regras do card: nome e descrição num bloco só, preço
// pela regra de valor (menos dígitos, maior), tudo com auto-fit.
export function desenharFaixa(ctx: Ctx2D, r: Retangulo, item: Item, kit: Kit, estilo: EstiloCaixa) {
  const h = r.h;
  const larguraFoto = Math.min(h * 1.25, r.w * 0.26);
  const larguraPreco = Math.min(h * 1.55, r.w * 0.32);
  const gap = h * 0.08;
  const foto: Retangulo = { x: r.x, y: r.y, w: larguraFoto, h };
  const preco: Retangulo = { x: r.x + r.w - larguraPreco, y: r.y, w: larguraPreco, h };
  const nome: Retangulo = { x: foto.x + foto.w + gap, y: r.y + h * 0.12, w: preco.x - gap - (foto.x + foto.w + gap), h: h * 0.76 };

  if (item.foto) desenharContido(ctx, item.foto, foto);
  const semCaixa = !!estilo.semCaixa;
  const raio = estilo.caixas.find((x) => x.papel === 'preco')?.raio ? h * 0.12 : 0;
  const caixa = (q: Retangulo, cor: string) => {
    ctx.fillStyle = cor;
    if (raio) { ctx.beginPath(); ctx.roundRect(q.x, q.y, q.w, q.h, raio); ctx.fill(); } else ctx.fillRect(q.x, q.y, q.w, q.h);
  };
  if (!semCaixa) { caixa(nome, kit.cores.caixa_descricao); caixa(preco, kit.cores.caixa_preco); }
  const dentro = (q: Retangulo, fx: number, fy: number): Retangulo => ({ x: q.x + q.w * fx, y: q.y + q.h * fy, w: q.w * (1 - 2 * fx), h: q.h * (1 - 2 * fy) });

  blocoNomeDescricao(ctx, item, kit, dentro(nome, 0.05, 0.1), nome.h * 0.42, 0.68, 2, semCaixa);

  const banner: Retangulo = { x: preco.x, y: preco.y, w: preco.w, h: preco.h * 0.2 };
  if (!semCaixa) { ctx.fillStyle = kit.cores.banner_fundo; ctx.fillRect(banner.x, banner.y, banner.w, banner.h); }
  linhaAjustada(ctx, (item.rotuloApp ?? kit.textos.rotulo_app).toUpperCase(), kit.fontes.banner,
    semCaixa ? kit.cores.texto_preco : kit.cores.banner_texto, dentro(banner, 0.05, 0.1), banner.h * 0.8, semCaixa);

  const temFator = !!item.fator;
  const fp = dentro({ x: preco.x, y: preco.y + preco.h * 0.2, w: preco.w, h: preco.h * (temFator ? 0.6 : 0.78) }, 0.05, 0.04);
  const p = separarPreco(item.preco);
  const cap = kit.metricas?.capHeightPreco ?? alturaDigitos(ctx, kit.fontes.preco);
  const F = maiorQueCabe((s) => { const m = medirPreco(ctx, p, kit.fontes.preco, s, cap); return m.largura <= fp.w && m.altura <= fp.h; }, fp.h * 1.4, fp.h * 0.1);
  const m = medirPreco(ctx, p, kit.fontes.preco, F, cap);
  desenharPreco(ctx, p, kit.fontes.preco, F, cap, fp.x + (fp.w - m.largura) / 2, fp.y + (fp.h - m.altura) / 2, kit.cores.texto_preco);
  if (temFator) linhaAjustada(ctx, item.fator!.toUpperCase(), kit.fontes.fator, kit.cores.texto_preco,
    dentro({ x: preco.x, y: preco.y + preco.h * 0.8, w: preco.w, h: preco.h * 0.2 }, 0.06, 0.08), preco.h * 0.16, semCaixa);
}
