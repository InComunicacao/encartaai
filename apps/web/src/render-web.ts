// Ponte entre o motor de render e o navegador: kit do cliente → Kit do
// motor, fontes carregadas ANTES de desenhar, imagens do banco em cache.
//
// Desenhar antes de a fonte chegar é o bug clássico "a fonte saiu errada
// no export" — por isso tudo aqui é aguardado.
import { KIT_PADRAO, type Fonte, type Imagem, type Kit } from '@encartaai/render';
import { urlArquivo } from './api';

interface FonteApi { origem: 'google' | 'arquivo'; familia: string; asset_id?: string; peso?: number }
export interface KitApi {
  fontes?: Partial<Record<'nome' | 'descricao' | 'preco' | 'rodape' | 'titulo', FonteApi>>;
  cores?: Partial<Record<string, string>>;
  textos?: Partial<Record<string, string>>;
}

const familiaDe = (f: FonteApi) => f.origem === 'arquivo' && f.asset_id ? 'ea-' + f.asset_id : f.familia;
const fonteDe = (f: FonteApi | undefined, padrao: Fonte): Fonte => f ? { familia: familiaDe(f), peso: f.peso ?? padrao.peso } : padrao;

export function kitDoCliente(k: KitApi): { kit: Kit; fontes: FonteApi[] } {
  const f = k.fontes || {}, c = k.cores || {}, t = k.textos || {};
  const P = KIT_PADRAO;
  const kit: Kit = {
    fontes: {
      nome: fonteDe(f.nome, P.fontes.nome), descricao: fonteDe(f.descricao, P.fontes.descricao), preco: fonteDe(f.preco, P.fontes.preco),
      banner: fonteDe(f.nome, P.fontes.banner), fator: fonteDe(f.nome, P.fontes.fator), rodape: fonteDe(f.rodape, P.fontes.rodape),
    },
    cores: {
      ...P.cores,
      caixa_preco: c.caixa_preco || P.cores.caixa_preco, texto_preco: c.texto_preco || P.cores.texto_preco,
      caixa_descricao: c.caixa_descricao || P.cores.caixa_descricao,
      texto_nome: c.texto_descricao || P.cores.texto_nome, texto_descricao: c.texto_descricao || P.cores.texto_descricao,
      banner_texto: c.caixa_preco || P.cores.banner_texto, rodape_fundo: c.rodape || P.cores.rodape_fundo,
    },
    textos: { rotulo_app: t.rotulo_app || P.textos.rotulo_app, rodape: t.rodape || P.textos.rodape },
  };
  // Fontes que precisam carregar: as do kit + as padrão do motor
  const usadas: FonteApi[] = Object.values(f).filter(Boolean) as FonteApi[];
  for (const p of Object.values(P.fontes)) if (!usadas.some((u) => familiaDe(u) === p.familia)) usadas.push({ origem: 'google', familia: p.familia, peso: Number(p.peso) || 400 });
  return { kit, fontes: usadas };
}

const carregando = new Map<string, Promise<void>>();
export function carregarFonte(f: FonteApi): Promise<void> {
  const fam = familiaDe(f), chave = fam + '|' + (f.peso ?? '');
  if (carregando.has(chave)) return carregando.get(chave)!;
  const p = (async () => {
    if (f.origem === 'arquivo' && f.asset_id) {
      const ff = new FontFace(fam, `url(${urlArquivo(f.asset_id)})`);
      document.fonts.add(await ff.load());
      return;
    }
    if (!document.querySelector(`link[data-fonte="${fam}"]`)) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.dataset.fonte = fam;
      l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, '+')}:wght@400;500;600;700;800;900&display=block`;
      document.head.appendChild(l);
      await new Promise((r) => { l.onload = r; l.onerror = r; });
    }
    await document.fonts.load(`${f.peso ?? 400} 40px "${fam}"`, '0123456789 ABCÇÃÉ');
  })().catch(() => {});
  carregando.set(chave, p);
  return p;
}

const imagens = new Map<string, Promise<Imagem | null>>();
export function carregarImagem(id: string | null | undefined): Promise<Imagem | null> {
  if (!id) return Promise.resolve(null);
  if (!imagens.has(id)) imagens.set(id, new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img); img.onerror = () => ok(null);
    img.src = urlArquivo(id);
  }));
  return imagens.get(id)!;
}

// Lista colada (do Excel, WhatsApp ou digitada): uma linha por produto.
// Com TAB: nome · descrição · preço · fator. Sem TAB: o preço é o último
// número com centavos; o fator (KG, UN…) logo depois dele; um EAN de 8–14
// dígitos em qualquer lugar.
const FATORES = /^(KG|UN|UND|UNID|CX|PCT|CADA\s*100\s*G|100\s*G|LT|L|DZ|BDJ)$/i;
export interface LinhaColada { nome: string; descricao: string; preco: string; fator: string; ean?: string }
export function lerLista(texto: string): LinhaColada[] {
  return texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    if (l.includes('\t')) {
      const [nome = '', descricao = '', preco = '', fator = ''] = l.split('\t').map((x) => x.trim());
      return { nome, descricao, preco, fator };
    }
    let s = l, ean: string | undefined;
    const e = s.match(/\b\d{8,14}\b/); if (e) { ean = e[0]; s = s.replace(e[0], ' '); }
    let fator = '';
    const precoM = s.match(/R?\$?\s*(\d{1,4}(?:\.\d{3})*[.,]\d{2})(?!.*\d[.,]\d{2})/);
    let preco = '';
    if (precoM) {
      preco = precoM[1];
      const depois = s.slice(precoM.index! + precoM[0].length).trim();
      if (FATORES.test(depois)) fator = depois.toUpperCase().replace(/\s+/g, ' ');
      s = s.slice(0, precoM.index);
    }
    // A medida no fim do nome vira descrição: "ARROZ TIPO 1 5KG" → ARROZ · TIPO 1 5KG.
    // É a hierarquia do encarte: nome grande, medida embaixo, menor.
    let nome = s.replace(/\s+/g, ' ').replace(/[-–:]\s*$/, '').trim(), descricao = '';
    const medida = nome.match(/\s+((?:TIPO\s+\d\s*)?(?:(?:C\/\s*|COM\s+)?\d+(?:[.,]\d+)?\s*(?:KG|G|GR|MG|ML|L|LT|UN|UND|UNID|M|CM|ROLOS?|UNIDADES)\b(?:\s+\S+)*|TIPO\s+\d)\s*)$/i);
    if (medida && medida.index! > 0) { descricao = medida[1].trim(); nome = nome.slice(0, medida.index).trim(); }
    return { nome, descricao, preco, fator, ean };
  });
}
