import { maiorQueCabe } from './autofit';
import { alturaDigitos, desenharPreco, fonteCss, medirPreco, separarPreco } from './preco';
import type { EstiloCaixa } from './estilos';
import { desenharRodape, type Rodape } from './rodape';
import { caixaCamada, type Camada } from './camadas';
import { FATOR_POLITICA, type Combo, type Ctx2D, type Formato, type Fonte, type Grade, type Imagem, type Item, type Kit, type PoliticaTexto, type Retangulo } from './tipos';

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

const limitarEscala = (v: number | undefined) => Math.min(1.5, Math.max(0.5, v ?? 1));

// "3,00" e 2 → "1,50". Vazio quando não dá para calcular.
export function unitarioCombo(c: Combo): string {
  if (c.unit && c.unit.trim()) return c.unit.trim();
  const p = separarPreco(c.preco), n = Math.floor(c.qtd);
  if (!n || n < 1) return '';
  const centavos = Math.round((Number(p.inteiro) * 100 + Number(p.centavos)) / n);
  return Math.floor(centavos / 100) + ',' + String(centavos % 100).padStart(2, '0');
}

// Caixa combinada, medida na v2 (coluna-combo): uma coluna à direita, mais
// alta que a etiqueta, com o preço "fora do app" em cima e o combo em
// baixo. Medidas em W (largura da célula), ancoradas na base.
function desenharCombo(ctx: Ctx2D, cel: Retangulo, c: Combo, fator: string | undefined, kit: Kit, contorno: boolean, escala: number): number {
  const W = cel.w, base = cel.y + cel.h;
  const col = { x: cel.x + W * (1 - 0.014 - 0.341), y: base - 0.570 * W, w: 0.341 * W, h: 0.570 * W };
  const fora: Retangulo = { x: col.x + col.w * (1 - 0.719), y: col.y, w: col.w * 0.719, h: col.h * 0.357 };
  const caixa: Retangulo = { x: col.x, y: fora.y + fora.h + col.h * 0.017, w: col.w, h: col.h * (1 - 0.357 - 0.017) };
  const cap = kit.metricas?.capHeightPreco ?? alturaDigitos(ctx, kit.fontes.preco);
  if (!contorno) for (const r of [fora, caixa]) { ctx.fillStyle = kit.cores.caixa_preco; ctx.fillRect(r.x, r.y, r.w, r.h); }
  const faixa = (r: Retangulo, a: number, b: number): Retangulo => ({ x: r.x, y: r.y + r.h * a, w: r.w, h: r.h * (b - a) });
  const barra = (r: Retangulo, txt: string) => {
    if (!contorno) { ctx.fillStyle = kit.cores.banner_fundo; ctx.fillRect(r.x, r.y, r.w, r.h); }
    linhaAjustada(ctx, txt.toUpperCase(), kit.fontes.banner, contorno ? kit.cores.texto_preco : kit.cores.banner_texto, dentro(r, 0.05, 0.1), r.h * 0.8, contorno);
  };
  let maior = 0;
  const preco = (r: Retangulo, valor: string) => {
    const p = separarPreco(valor), q = dentro(r, 0.06, 0.04);
    const F = maiorQueCabe((s) => { const m = medirPreco(ctx, p, kit.fontes.preco, s, cap); return m.largura <= q.w && m.altura <= q.h; }, q.h * 1.4 * escala, q.h * 0.1);
    const m = medirPreco(ctx, p, kit.fontes.preco, F, cap);
    desenharPreco(ctx, p, kit.fontes.preco, F, cap, q.x + (q.w - m.largura) / 2, q.y + (q.h - m.altura) / 2, kit.cores.texto_preco);
    maior = Math.max(maior, F);
  };
  // em cima: FORA DO APP · preço cheio · fator
  barra(faixa(fora, 0, 0.21), c.rotuloFora || 'FORA DO APP');
  preco(faixa(fora, 0.21, fator ? 0.8 : 1), c.precoFora || '0,00');
  if (fator) linhaAjustada(ctx, fator.toUpperCase(), kit.fontes.fator, kit.cores.texto_preco, dentro(faixa(fora, 0.8, 1), 0.08, 0.05), fora.h * 0.17, contorno);
  // embaixo: LEVE 3 POR · total · legenda · unitário
  barra(faixa(caixa, 0, 0.176), c.rotulo || `LEVE ${Math.max(1, Math.floor(c.qtd || 1))} POR`);
  preco(faixa(caixa, 0.176, 0.528), c.preco);
  linhaAjustada(ctx, (c.rotuloUnit || 'NESTA PROMOÇÃO A UNIDADE SAI POR').toUpperCase(), kit.fontes.banner, kit.cores.texto_preco,
    dentro(faixa(caixa, 0.528, 0.648), 0.05, 0.12), caixa.h * 0.1, contorno);
  const u = unitarioCombo(c);
  if (u) preco(faixa(caixa, 0.648, 1), u);
  return maior;
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

  // foto: do topo da célula até o topo da caixa de descrição, encostada
  // embaixo. O ajuste (zoom e deslocamento) parte da base, centralizado.
  if (item.foto) {
    const a = item.fotoAjuste, e = a?.escala ?? 1, r = { x: cel.x, y: cel.y, w: W, h: cd.r.y - cel.y };
    desenharContido(ctx, item.foto, { x: r.x + r.w * (1 - e) / 2 + (a?.dx ?? 0) * W, y: r.y + r.h * (1 - e) + (a?.dy ?? 0) * cel.h,
      w: r.w * e, h: r.h * e }, 'base');
  }
  if (item.selo) desenharContido(ctx, item.selo, { x: cel.x + W * 0.63, y: cel.y + cel.h * 0.02, w: W * 0.36, h: cel.h * 0.32 });

  const contorno = !!estilo.semCaixa;
  const combo = item.combo && item.combo.preco ? item.combo : null;
  if (!estilo.semCaixa) {
    for (const [c, cor] of (combo ? [[cd, kit.cores.caixa_descricao]] : [[cd, kit.cores.caixa_descricao], [cp, kit.cores.caixa_preco]]) as [typeof cd, string][]) {
      ctx.fillStyle = cor;
      if (c.raio) { ctx.beginPath(); ctx.roundRect(c.r.x, c.r.y, c.r.w, c.r.h, c.raio); ctx.fill(); }
      else ctx.fillRect(c.r.x, c.r.y, c.r.w, c.r.h);
    }
  }

  const texto = blocoNomeDescricao(ctx, item, kit, dentro(cd.r, estilo.respiro.x, estilo.respiro.y),
    t.nome * W * k * limitarEscala(item.escalaNome), t.descricao / t.nome, estilo.nomeLinhasMax, contorno);

  if (combo) {
    const F = desenharCombo(ctx, cel, combo, item.fator, kit, contorno, limitarEscala(item.escalaPreco));
    return { corpoNome: texto.corpoNome, corpoPreco: F };
  }

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
    t.preco * W * k * limitarEscala(item.escalaPreco), t.preco * W * 0.2);
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
  rodape?: Rodape | null;
  camadas?: Camada[];
  logoAjuste?: { escala: number; dx: number; dy: number } | null;   // dx, dy em fração do formato
}

function desenharCamada(ctx: Ctx2D, c: Camada, f: Formato, g: Grade) {
  if (!c.imagem || c.oculto) return;
  const k = caixaCamada(c, f, g);
  ctx.save();
  ctx.translate(k.cx, k.cy);
  if (k.rot) ctx.rotate((k.rot * Math.PI) / 180);
  ctx.drawImage(c.imagem, -k.w / 2, -k.h / 2, k.w, k.h);
  ctx.restore();
}

export function desenharEncarte(ctx: Ctx2D, e: Encarte, escala = 1): ResultadoCard[] {
  const f = e.formato;
  ctx.save();
  ctx.scale(escala, escala);
  if (e.fundo) desenharCobrindo(ctx, e.fundo, { x: 0, y: 0, w: f.w, h: f.h });
  else { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, f.w, f.h); }
  // camada presa a um produto some com ele (fora da grade ou oculto)
  const camadas = (e.camadas || []).filter((c) => c.ancora == null || (e.grade.celulas[c.ancora] && e.itens[c.ancora] && !e.itens[c.ancora].oculto));
  for (const c of camadas) if (c.atras) desenharCamada(ctx, c, f, e.grade);
  if (e.logo) {
    const r = px(f.logo, f), a = e.logoAjuste, k = a?.escala ?? 1;
    desenharContido(ctx, e.logo, { x: r.x + r.w * (1 - k) / 2 + (a?.dx ?? 0) * f.w, y: r.y + r.h * (1 - k) / 2 + (a?.dy ?? 0) * f.h, w: r.w * k, h: r.h * k });
  }

  const res = e.grade.celulas.map((c, i) => e.itens[i] && !e.itens[i].oculto
    ? desenharCard(ctx, px(c, f), e.itens[i], e.kit, e.grade, e.estilo, e.politica)
    : { corpoNome: 0, corpoPreco: 0 });

  // rodapé: o da campanha (blocos, personagem, cores) ou, sem ele, o
  // texto do kit numa faixa simples
  desenharRodape(ctx, px(f.rodape, f), e.rodape ?? { blocos: [{ texto: e.kit.textos.rodape }] }, e.kit);
  // frente de tudo: por cima dos produtos e do rodapé (personagens que "saem" da faixa)
  for (const c of camadas) if (!c.atras) desenharCamada(ctx, c, f, e.grade);

  ctx.restore();
  return res;
}
