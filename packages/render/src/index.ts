// @encartaai/render — o motor de render da EncartaAi.
import medidas from './medidas-v2.json';
import type { Formato, Grade, Kit } from './tipos';

export * from './tipos';
export * from './autofit';
export * from './preco';
export * from './estilos';
export * from './desenhar';

// Formato e grades medidos na v2 (encarte_81), ver test/geometria_v2.json.
export const ENCARTE_VERTICAL: Formato = {
  id: 'encarte_1080x1920', nome: 'Encarte vertical', w: 1080, h: 1920,
  logo: medidas.logo, rodape: medidas.rodape,
};

export const GRADES: Record<string, Grade> = Object.fromEntries(
  Object.entries(medidas.grades).map(([k, g]) => [k, g as Grade]));

// Kit padrão de qualquer cliente novo: só fontes gratuitas (Google Fonts).
export const KIT_PADRAO: Kit = {
  fontes: {
    nome: { familia: 'Barlow Condensed', peso: 700 }, descricao: { familia: 'Barlow Condensed', peso: 500 },
    preco: { familia: 'Anton' }, banner: { familia: 'Barlow Condensed', peso: 700 },
    fator: { familia: 'Barlow Condensed', peso: 700 }, rodape: { familia: 'Barlow Condensed', peso: 500 },
  },
  cores: {
    caixa_preco: '#e40010', texto_preco: '#ffffff', caixa_descricao: '#ffffff', texto_nome: '#111111',
    texto_descricao: '#222222', banner_fundo: '#ffffff', banner_texto: '#e40010', rodape_fundo: '#1f2937', rodape_texto: '#ffffff',
  },
  textos: { rotulo_app: 'Preço no aplicativo', rodape: 'Ofertas válidas enquanto durarem os estoques.' },
};

// O kit da v2, com as fontes Gotham (licenciadas, plano Completo). Usado
// nos testes de comparação com a v2.
export const KIT_GOTHAM: Kit = {
  ...KIT_PADRAO,
  fontes: {
    nome: { familia: 'GothamCondMediumItalic' }, descricao: { familia: 'GothamBookItalic' },
    preco: { familia: 'GothamUltra', peso: 900 }, banner: { familia: 'GothamCondMediumItalic' },
    fator: { familia: 'GothamCondMediumItalic' }, rodape: { familia: 'GothamBookItalic' },
  },
  cores: { ...KIT_PADRAO.cores, rodape_fundo: '#0057b8' },
  metricas: { capHeightPreco: 0.7 },
};
