// Auto-fit: o maior corpo que cabe.
//
// Herdado da v2 (patch da v75), com a mesma justificativa: o problema é
// MONOTÔNICO — se um corpo cabe, todos os menores cabem. Isso autoriza
// cortar o intervalo pela metade a cada passo. 10 medições dão precisão
// de 1/1024 do intervalo, contra milhares da busca linear.

export function maiorQueCabe(cabe: (tamanho: number) => boolean, maximo: number, minimo = maximo * 0.2, passos = 10): number {
  if (cabe(maximo)) return maximo;
  if (!cabe(minimo)) return minimo;          // nem o mínimo cabe: devolve o mínimo e quem chamou corta
  let lo = minimo, hi = maximo;
  for (let i = 0; i < passos; i++) {
    const meio = (lo + hi) / 2;
    if (cabe(meio)) lo = meio; else hi = meio;
  }
  return lo;                                 // lo SEMPRE cabe: nunca devolve um tamanho que transborda
}
