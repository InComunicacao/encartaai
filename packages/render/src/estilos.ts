// Estilos de caixa de preço.
//
// UNIDADE: fração da LARGURA da célula (W), e as caixas são ancoradas na
// BASE da célula. Essa é a regra que a medição da v2 revelou: em todas as
// grades, a caixa branca tem 0,236·W de altura e a vermelha 0,319·W —
// o bloco de informação escala com a largura do card, e a foto ocupa o que
// sobra acima. Medido no encarte_81, ver test/geometria_v2.json.
//
// Um estilo novo é só um objeto destes: o auto-fit e as regras de
// hierarquia valem para qualquer um.

export interface CaixaEstilo {
  papel: 'descricao' | 'preco';
  x: number; w: number; h: number;          // em W; y = base da célula − h·W
  raio?: number;                            // em W
}

export interface EstiloCaixa {
  id: string;
  nome: string;
  semCaixa?: boolean;                       // texto direto no fundo, com contorno automático
  caixas: CaixaEstilo[];
  // Fatias da caixa de preço (frações da altura dela), de cima para baixo.
  fatias: { banner: [number, number]; preco: [number, number]; fator: [number, number] };
  // Respiro interno da caixa de descrição (frações dela).
  respiro: { x: number; y: number };
  nomeLinhasMax: number;
}

export const ETIQUETA_VERMELHA: EstiloCaixa = {
  id: 'etiqueta_vermelha',
  nome: 'Etiqueta (padrão Terê)',
  caixas: [
    { papel: 'descricao', x: -0.04, w: 0.68, h: 0.236 },
    { papel: 'preco', x: 0.64, w: 0.40, h: 0.319 },
  ],
  // banner 0–16,6% · preço 16,6–81,3% · fator 80–100%: medido na v2
  fatias: { banner: [0, 0.166], preco: [0.166, 0.813], fator: [0.80, 1.0] },
  respiro: { x: 0.07, y: 0.12 },
  nomeLinhasMax: 2,
};

export const ETIQUETA_ARREDONDADA: EstiloCaixa = {
  ...ETIQUETA_VERMELHA,
  id: 'etiqueta_arredondada',
  nome: 'Etiqueta arredondada',
  caixas: [
    { papel: 'descricao', x: -0.02, w: 0.66, h: 0.236, raio: 0.04 },
    { papel: 'preco', x: 0.62, w: 0.40, h: 0.319, raio: 0.05 },
  ],
};

// Sem caixa: as mesmas áreas, sem fundo. O texto ganha contorno na cor
// oposta, então continua legível sobre qualquer tema.
export const SEM_CAIXA: EstiloCaixa = {
  ...ETIQUETA_VERMELHA,
  id: 'sem_caixa',
  nome: 'Sem caixa',
  semCaixa: true,
};

export const ESTILOS: Record<string, EstiloCaixa> = Object.fromEntries(
  [ETIQUETA_VERMELHA, ETIQUETA_ARREDONDADA, SEM_CAIXA].map((e) => [e.id, e]));
