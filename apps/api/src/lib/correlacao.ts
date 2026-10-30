// Correlação entre o que alguém digitou e um produto do banco.
//
// Ordem de confiança, da maior para a menor:
//   1. EAN/SKU idêntico           → aplica direto
//   2. apelido já confirmado      → aplica direto (o texto INTEIRO normalizado,
//                                   com números: "coca 2l" e "coca 350ml"
//                                   são produtos diferentes)
//   3. pontuação por palavras     → SUGERE as 3 melhores, alguém confirma
//
// Quando alguém confirma, o texto vira apelido daquele produto e o passo 2
// acerta da próxima vez. É isso que substitui o limiar fixo de 0,34 da v2.

export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Texto inteiro, para apelido: minúsculo, sem acento, espaços colapsados,
// "2 L" e "2l" iguais.
export function normalizarApelido(s: string): string {
  return semAcento(s).toLowerCase()
    .replace(/(\d)\s+(kg|g|mg|l|ml|un|und|pct|cx)\b/g, '$1$2')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

const PALAVRAS_VAZIAS = new Set(['com', 'sem', 'para', 'por', 'das', 'dos', 'del', 'the', 'tipo', 'und', 'unid', 'pct', 'cada']);

// Palavras que carregam o produto: 3+ letras, sem números, sem as vazias.
export function palavras(s: string): string[] {
  return [...new Set(normalizarApelido(s).split(' ')
    .filter((p) => p.length >= 3 && !/\d/.test(p) && !PALAVRAS_VAZIAS.has(p)))];
}

// Quanto da consulta o candidato cobre, penalizando candidatos prolixos.
// Palavra igual vale 1; prefixo de 4+ letras ("refrig" ~ "refrigerante") vale 0,7.
export function pontuar(consulta: string[], candidato: string[]): number {
  if (!consulta.length || !candidato.length) return 0;
  let soma = 0;
  for (const q of consulta) {
    let melhor = 0;
    for (const c of candidato) {
      if (q === c) { melhor = 1; break; }
      const [a, b] = q.length < c.length ? [q, c] : [c, q];
      if (a.length >= 4 && b.startsWith(a)) melhor = Math.max(melhor, 0.7);
    }
    soma += melhor;
  }
  const cobertura = soma / consulta.length;
  const precisao = soma / candidato.length;
  return Math.round((0.75 * cobertura + 0.25 * precisao) * 1000) / 1000;
}

export const PONTUACAO_MINIMA = 0.4;

export function soDigitos(s: string | null | undefined): string | null {
  const d = (s || '').replace(/\D/g, '');
  return d.length >= 6 ? d : null;
}
