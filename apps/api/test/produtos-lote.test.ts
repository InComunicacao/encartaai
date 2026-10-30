// Importação de produtos pela planilha e ajustes por item da campanha.
import { describe, it, expect, beforeAll } from 'vitest';
import { req, enviar, montarCenario, PNG_1x1 } from './util';

let S: Awaited<ReturnType<typeof montarCenario>>;
beforeAll(async () => { S = await montarCenario(); });

describe('produtos pela planilha', () => {
  it('foto enviada antes cria o produto pelo EAN; a planilha completa o nome', async () => {
    await enviar(S.A, PNG_1x1, 'image/png', 'tipo=produto&nome=' + encodeURIComponent('coca 2l 7896005800027'));
    const r = await req('POST', '/produtos/lote', { linhas: [
      { ean: '7896005800027', nome: 'Refrigerante Coca-Cola 2L', descricao: 'Pet 2L', categoria: 'Bebidas' },
      { ean: '7890000000024', nome: 'Leite Condensado' },
      { nome: 'Pão Francês' },
      { ean: '12ab', nome: 'EAN torto' },
      { ean: '7890000000031', nome: '' },
    ] }, S.A);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ criados: 2, atualizados: 1, total_erros: 2 });
    expect(r.json.erros.map((e: any) => e.linha)).toEqual([4, 5]);
    const p = (await req('GET', '/produtos?q=7896005800027', undefined, S.A)).json.produtos[0];
    expect(p.nome).toBe('Refrigerante Coca-Cola 2L'); expect(p.foto_id).toBeTruthy();
  });
  it('importar de novo atualiza pelo EAN e não duplica os sem EAN', async () => {
    const r = await req('POST', '/produtos/lote', { linhas: [{ ean: '7896005800027', nome: 'Coca-Cola 2L' }, { nome: 'PÃO FRANCÊS' }] }, S.A);
    expect(r.json).toMatchObject({ criados: 0, atualizados: 1, ignorados: 1 });
    expect((await req('GET', '/produtos', undefined, S.A)).json.produtos).toHaveLength(3);
  });
  it('foto enviada DEPOIS liga sozinha pelo EAN no nome', async () => {
    const r = await enviar(S.A, PNG_1x1, 'image/png', 'tipo=produto&nome=7890000000024');
    expect(r.json.produto_id).toBeTruthy();
  });
  it('operador não importa; outro cliente não enxerga', async () => {
    expect((await req('GET', '/produtos', undefined, S.B)).json.produtos).toHaveLength(0);
    expect((await req('POST', '/produtos/lote', { linhas: [] }, S.A)).status).toBe(400);
  });
});

describe('ajustes por item da campanha', () => {
  it('guarda ocultar, foto, tamanhos e combo, presos nos limites', async () => {
    const id = (await req('POST', '/campanhas', { nome: 'Combo' }, S.A)).json.id;
    await req('PUT', '/campanhas/' + id, { itens: [{ nome: 'Refri', preco: '9,99', oculto: true, foto_ajuste: { dx: 5, dy: -0.1, escala: 9 },
      escala_nome: 0.1, escala_preco: 1.2, combo: { preco_fora: '2,49', qtd: 3, preco: '5,00', lixo: 'x' } }] }, S.A);
    const it = (await req('GET', '/campanhas/' + id, undefined, S.A)).json.campanha.itens[0];
    expect(it).toMatchObject({ oculto: true, foto_ajuste: { dx: 1, dy: -0.1, escala: 3 }, escala_nome: 0.5, escala_preco: 1.2,
      combo: { preco_fora: '2,49', qtd: 3, preco: '5,00' } });
    expect(it.combo).not.toHaveProperty('lixo');
  });
});
