import { maiorQueCabe } from './autofit';
import { alturaDigitos, desenharPreco, fonteCss, medirPreco, separarPreco } from './preco';
import type { EstiloCaixa } from './estilos';
import { FATOR_POLITICA, type Ctx2D, type Formato, type Fonte, type Grade, type Imagem, type Item, type Kit, type PoliticaTexto, type Retangulo } from './tipos';

const ALTURA_LINHA = 1.05;                  // em corpos

const px = (r: Retangulo, f: Formato): Retangulo => ({ x: r.x * f.w, y: r.y * f.h, w: r.w * f.w, h: r.h * f.h });
const dentro = (r: Retangulo, fx: number, fy: number): Retangulo =>
  ({ x: r.x + r.w * fx, y: r.y + r.h * fy, w: r.w * (1 - 2 * fx), h: r.h * (1 - 2 * fy) });

// ── imagens ─────────────────────────────────────────────────────────
export function desenharContido(ctx: Ctx2D, img: Imagem, r: Retangulo, alinhar: 'centro' | 'base' = 'centro') {
  const e = Math.min(r.w / img.width, r.h / img.height);
  const w = img.width * e, h = img.height * e;
  const y = alinhar === 'base' ? r.y + r.h - h : r.y + (r.h - h) / 2;
  ctx.drawImage(img, r.x + (r.w - w) / 2, y, w, h);
}
export function desenharCobrindo(ctx: Ctx2D, img: Imagem, r: Retangulo) {
  const e = Math.max(r.w / img.width, r.h / img.height);
  const w = img.width * e, h = img.height * e;
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  ctx.drawImage(img, r.x + (r.w - w) / 2, r.y + (r.h - h) / 2, w, h);
  ctx.restore();
}

// ── texto ───────────────────────────────────────────────────────────
// Quebra por palavras em até `max` linhas. null = não coube.
export function quebrar(ctx: Ctx2D, texto: string, fonte: Fonte, corpo: number, largura: number, max: number): string[] | null {
  ctx.font = fonteCss(fonte, corpo);
  const palavras = texto.trim().split(/\s+/).filter(Boolean);
  if (!palavras.length) return [];
  const linhas: string[] = [];
  let atual = '';
  for (const p of palavras) {
    const tentativa = atual ? atual + ' ' + p : p;
    if (ctx.measureText(tentativa).width <= largura) { atual = tentativa; continue; }
    if (!atual) return null;                // uma palavra sozinha não cabe
    linhas.push(atual); atual = p;
    if (ctx.measureText(p).width > largura) return null;
    if (linhas.length >= max) return null;
  }
  linhas.push(atual);
  return linhas.length <= max ? linhas : null;
}

export function luminancia(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function escrever(ctx: Ctx2D, texto: string, x: number, base: number, cor: string, contorno: boolean, corpo: number) {
  if (contorno) {
    ctx.strokeStyle = luminancia(cor) > 0.55 ? '#111111' : '#ffffff';
    ctx.lineWidth = Math.max(1, corpo * 0.14);
    ctx.lineJoin = 'round';
    ctx.strokeText(texto, x, base);
  }
  ctx.fillStyle = cor;
  ctx.fillText(texto, x, base);
}

// Uma linha de texto que cresce até o máximo e encolhe para caber.
export function linhaAjustada(ctx: Ctx2D, texto: string, fonte: Fonte, cor: string, area: Retangulo, maximo: number, contorno = false) {
  if (!texto) return;
  const corpo = maiorQueCabe((s) => {
    ctx.font = fonteCss(fonte, s);
    return ctx.measureText(texto).width <= area.w && s * 0.72 <= area.h;
  }, maximo, maximo * 0.15);
  ctx.font = fonteCss(fonte, corpo);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // centra pela altura de maiúscula (~0,72 do corpo nas fontes de oferta)
  escrever(ctx, texto, area.x + area.w / 2, area.y + area.h / 2 + corpo * 0.36, cor, contorno, corpo);
}

// NOME E DESCRIÇÃO SÃO UM BLOCO SÓ, com UMA escala.
// Regra herdada da v2: ajustados separadamente, "1KG" numa caixa larga
// sairia maior que o nome do produto. Aqui o corpo da descrição é sempre
// a mesma fração do corpo do nome, e o bloco inteiro é que se ajusta.
export function blocoNomeDescricao(ctx: Ctx2D, item: Item, kit: Kit, area: Retangulo, maxNome: number, razaoDescricao: number,
  linhasMax: number, contorno: boolean) {
  const desc = (item.descricao || '').trim();
  let montagem: { nome: string[]; desc: string[] } = { nome: [], desc: [] };
  const corpo = maiorQueCabe((s) => {
    const n = quebrar(ctx, item.nome.toUpperCase(), kit.fontes.nome, s, area.w, linhasMax);
    const d = desc ? quebrar(ctx, desc.toUpperCase(), kit.fontes.descricao, s * razaoDescricao, area.w, 2) : [];
    if (!n || !d) return false;
    const altura = (n.length * s + d.length * s * razaoDescricao) * ALTURA_LINHA;
    if (altura > area.h) return false;
    montagem = { nome: n, desc: d };
    return true;
  }, maxNome, maxNome * 0.15);
  // refaz no tamanho final: o callback guardou a montagem da ÚLTIMA tentativa, não necessariamente da que venceu
  montagem = { nome: quebrar(ctx, item.nome.toUpperCase(), kit.fontes.nome, corpo, area.w, linhasMax) || [item.nome.toUpperCase()],
    desc: desc ? (quebrar(ctx, desc.toUpperCase(), kit.fontes.descricao, corpo * razaoDescricao, area.w, 2) || [desc.toUpperCase()]) : [] };
  const d = corpo * razaoDescricao;
  const alturaTotal = (montagem.nome.length * corpo + montagem.desc.length * d) * ALTURA_LINHA;
  let y = area.y + (area.h - alturaTotal) / 2;
  // O BLOCO é centralizado na caixa; as LINHAS alinham à esquerda dentro
  // dele — é assim no PSD do cliente e na v2 (nome e descrição começam na
  // mesma coluna, e o conjunto fica no meio).
  const larg = (fonte: Fonte, s: number, l: string) => { ctx.font = fonteCss(fonte, s); return ctx.measureText(l).width; };
  const largBloco = Math.max(0, ...montagem.nome.map((l) => larg(kit.fontes.nome, corpo, l)),
    ...montagem.desc.map((l) => larg(kit.fontes.descricao, d, l)));
  const x0 = area.x + (area.w - largBloco) / 2;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  for (const l of montagem.nome) {
    ctx.font = fonteCss(kit.fontes.nome, corpo);
    y += corpo * ALTURA_LINHA;
    escrever(ctx, l, x0, y - corpo * 0.22, kit.cores.texto_nome, contorno, corpo);
  }
  for (const l of montagem.desc) {
    ctx.font = fonteCss(kit.fontes.descricao, d);
    y += d * ALTURA_LINHA;
    escrever(ctx, l, x0, y - d * 0.22, kit.cores.texto_descricao, contorno, d);
  }
  return { corpoNome: corpo, corpoDescricao: d, linhasNome: montagem.nome.length };
}

// ── card ────────────────────────────────────────────────────────────
export interface ResultadoCard { corpoNome: number; corpoPreco: number }

export function desenharCard(ctx: Ctx2D, cel: Retangulo, item: Item, kit: Kit, grade: Grade, estilo: EstiloCaixa,
  politica: PoliticaTexto = 'maior'): ResultadoCard {
  const W = cel.w, base = cel.y + cel.h, k = FATOR_POLITICA[politica];
  const t = grade.tipografia;
  const caixa = (papel: 'descricao' | 'preco') => {
    const c = estilo.caixas.find((x) => x.papel === papel)!;
    return { r: { x: cel.x + c.x * W, y: base - c.h * W, w: c.w * W, h: c.h * W }, raio: (c.raio || 0) * W };
  };
  const cd = caixa('descricao'), cp = caixa('preco');

  // foto: do topo da célula até o topo da caixa de descrição, encostada embaixo
  if (item.foto) desenharContido(ctx, item.foto, { x: cel.x, y: cel.y, w: W, h: cd.r.y - cel.y }, 'base');
  if (item.selo) desenharContido(ctx, item.selo, { x: cel.x + W * 0.63, y: cel.y + cel.h * 0.02, w: W * 0.36, h: cel.h * 0.32 });

  const contorno = !!estilo.semCaixa;
  if (!estilo.semCaixa) {
    for (const [c, cor] of [[cd, kit.cores.caixa_descricao], [cp, kit.cores.caixa_preco]] as const) {
      ctx.fillStyle = cor;
      if (c.raio) { ctx.beginPath(); ctx.roundRect(c.r.x, c.r.y, c.r.w, c.r.h, c.raio); ctx.fill(); }
      else ctx.fillRect(c.r.x, c.r.y, c.r.w, c.r.h);
    }
  }

  const texto = blocoNomeDescricao(ctx, item, kit, dentro(cd.r, estilo.respiro.x, estilo.respiro.y),
    t.nome * W * k, t.descricao / t.nome, estilo.nomeLinhasMax, contorno);

  // caixa de preço, em fatias
  const fatia = ([a, b]: [number, number]): Retangulo => ({ x: cp.r.x, y: cp.r.y + cp.r.h * a, w: cp.r.w, h: cp.r.h * (b - a) });
  const fb = fatia(estilo.fatias.banner);
  if (!estilo.semCaixa) { ctx.fillStyle = kit.cores.banner_fundo; ctx.fillRect(fb.x, fb.y, fb.w, fb.h); }
  linhaAjustada(ctx, (item.rotuloApp ?? kit.textos.rotulo_app).toUpperCase(), kit.fontes.banner,
    estilo.semCaixa ? kit.cores.texto_preco : kit.cores.banner_texto, dentro(fb, 0.05, 0.08), t.banner * W, contorno);

  const fp = dentro(fatia(estilo.fatias.preco), 0.035, 0.03);
  const p = separarPreco(item.preco);
  const cap = kit.metricas?.capHeightPreco ?? alturaDigitos(ctx, kit.fontes.preco);
  const F = maiorQueCabe((s) => { const m = medirPreco(ctx, p, kit.fontes.preco, s, cap); return m.largura <= fp.w && m.altura <= fp.h; },
    t.preco * W * k, t.preco * W * 0.2);
  const m = medirPreco(ctx, p, kit.fontes.preco, F, cap);
  if (contorno) {
    // contorno no preço: desenha uma vez em traço grosso por baixo
    ctx.save(); ctx.strokeStyle = luminancia(kit.cores.texto_preco) > 0.55 ? '#111' : '#fff';
    ctx.lineWidth = F * 0.08; ctx.lineJoin = 'round';
    ctx.font = fonteCss(kit.fontes.preco, F); ctx.textAlign = 'left';
    ctx.strokeText(p.inteiro, fp.x + (fp.w - m.largura) / 2, fp.y + (fp.h - m.altura) / 2 + cap * F);
    ctx.restore();
  }
  desenharPreco(ctx, p, kit.fontes.preco, F, cap, fp.x + (fp.w - m.largura) / 2, fp.y + (fp.h - m.altura) / 2, kit.cores.texto_preco);

  if (item.fator) linhaAjustada(ctx, item.fator.toUpperCase(), kit.fontes.fator, kit.cores.texto_preco,
    dentro(fatia(estilo.fatias.fator), 0.06, 0.1), t.fator * W, contorno);

  return { corpoNome: texto.corpoNome, corpoPreco: F };
}

// ── encarte ─────────────────────────────────────────────────────────
export interface Encarte {
  formato: Formato;
  grade: Grade;
  estilo: EstiloCaixa;
  kit: Kit;
  itens: Item[];
  fundo?: Imagem | null;
  logo?: Imagem | null;
  politica?: PoliticaTexto;
}

export function desenharEncarte(ctx: Ctx2D, e: Encarte, escala = 1): ResultadoCard[] {
  const f = e.formato;
  ctx.save();
  ctx.scale(escala, escala);
  if (e.fundo) desenharCobrindo(ctx, e.fundo, { x: 0, y: 0, w: f.w, h: f.h });
  else { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, f.w, f.h); }
  if (e.logo) desenharContido(ctx, e.logo, px(f.logo, f));

  const res = e.grade.celulas.map((c, i) => e.itens[i]
    ? desenharCard(ctx, px(c, f), e.itens[i], e.kit, e.grade, e.estilo, e.politica)
    : { corpoNome: 0, corpoPreco: 0 });

  const r = px(f.rodape, f);
  ctx.fillStyle = e.kit.cores.rodape_fundo;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const area = dentro(r, 0.04, 0.12);
  const corpo = maiorQueCabe((s) => {
    const l = quebrar(ctx, e.kit.textos.rodape, e.kit.fontes.rodape, s, area.w, 6);
    return !!l && l.length * s * 1.2 <= area.h;
  }, area.h * 0.3, 6);
  const linhas = quebrar(ctx, e.kit.textos.rodape, e.kit.fontes.rodape, corpo, area.w, 99) || [];
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = e.kit.cores.rodape_texto;
  ctx.font = fonteCss(e.kit.fontes.rodape, corpo);
  let y = area.y + (area.h - linhas.length * corpo * 1.2) / 2;
  for (const l of linhas) { y += corpo * 1.2; ctx.fillText(l, area.x + area.w / 2, y - corpo * 0.3); }

  ctx.restore();
  return res;
}
