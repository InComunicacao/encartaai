// O motor de render desenha qualquer saída a partir de DADOS:
//   campanha (itens) + kit da marca (cores, fontes, textos) + templates.
// Tela, PNG, vídeo e PDF chamam o mesmo código — o que se vê é o que sai.
//
// Medidas de template são FRAÇÕES, nunca pixels: a mesma grade serve a um
// encarte de 1080×1920 e a uma lona de 3 metros.

export interface Retangulo { x: number; y: number; w: number; h: number }

// Contexto 2D mínimo que o motor usa. O do navegador e o do @napi-rs/canvas
// (testes em Node) satisfazem os dois.
export type Ctx2D = Pick<CanvasRenderingContext2D,
  'save' | 'restore' | 'fillRect' | 'fillText' | 'measureText' | 'drawImage' | 'beginPath' | 'rect' | 'clip' |
  'translate' | 'scale' | 'rotate' | 'roundRect' | 'fill' | 'strokeText'> & {
  globalAlpha: number;
  font: string; fillStyle: string | CanvasGradient | CanvasPattern; textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline; strokeStyle: string | CanvasGradient | CanvasPattern; lineWidth: number; lineJoin: CanvasLineJoin;
};

export type Imagem = CanvasImageSource & { width: number; height: number };

export interface Fonte { familia: string; peso?: number | string }

export interface Kit {
  fontes: { nome: Fonte; descricao: Fonte; preco: Fonte; banner: Fonte; fator: Fonte; rodape: Fonte };
  cores: {
    caixa_preco: string; texto_preco: string; caixa_descricao: string; texto_nome: string; texto_descricao: string;
    banner_fundo: string; banner_texto: string; rodape_fundo: string; rodape_texto: string;
  };
  textos: { rotulo_app: string; rodape: string };
  // Métricas medidas da fonte do preço (fontTools). capHeight alinha os
  // centavos pelo topo dos dígitos inteiros. Gotham: 0.700.
  metricas?: { capHeightPreco?: number };
}

export interface Item {
  nome: string;
  descricao?: string;
  preco: string;                 // '24,90'
  fator?: string;                // 'UN', 'KG', 'CADA 100G'
  rotuloApp?: string;            // sobrescreve kit.textos.rotulo_app
  foto?: Imagem | null;
  selo?: Imagem | null;
}

// Grade: uma célula por produto, em frações do formato.
export interface Grade {
  id: string;
  nome: string;
  celulas: Retangulo[];
  // Corpo MÁXIMO de cada texto, em frações da LARGURA da célula. O auto-fit
  // só desce a partir daqui; os valores da v2 foram calibrados com o cliente.
  tipografia: { nome: number; descricao: number; preco: number; banner: number; fator: number };
}

// Política de texto do encarte (QR Ofertas: "maior possível / médio / mínimo").
export type PoliticaTexto = 'maior' | 'medio' | 'minimo';
export const FATOR_POLITICA: Record<PoliticaTexto, number> = { maior: 1, medio: 0.88, minimo: 0.76 };

export interface Formato {
  id: string;
  nome: string;
  w: number;                     // px na escala 1
  h: number;
  logo: Retangulo;               // área da logo da loja
  rodape: Retangulo;
}
