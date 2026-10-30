// Campanhas e logo por loja.
import { describe, it, expect, beforeAll } from 'vitest';
import { req, enviar, montarCenario, PNG_1x1 } from './util';

let S: Awaited<ReturnType<typeof montarCenario>>;
let camp: string;
beforeAll(async () => { S = await montarCenario(); });

const itens = [
  { nome: 'Arroz 5kg', descricao: 'Tipo 1', preco: '24,90', fator: 'UN' },
  { nome: 'Feijão 1kg', preco: '7,49', fator: 'UN', campo_inventado: 'x' },
];

describe('campanhas', () => {
  it('cria com tema padrão e lista', async () => {
    const r = await req('POST', '/campanhas', { nome: 'Ofertas da semana' }, S.A);
    expect(r.status).toBe(201); camp = r.json.id;
    const l = await req('GET', '/campanhas', undefined, S.A);
    expect(l.json.campanhas[0]).toMatchObject({ nome: 'Ofertas da semana', itens: 0, tema: { grade: '9', estilo: 'etiqueta_vermelha' } });
  });
  it('salva tema e itens de uma vez, e lê de volta na ordem', async () => {
    const r = await req('PUT', '/campanhas/' + camp, { tema: { grade: '4', estilo: 'sem_caixa', politica: 'medio' }, itens }, S.A);
    expect(r.status).toBe(200);
    const g = await req('GET', '/campanhas/' + camp, undefined, S.A);
    expect(g.json.campanha.tema).toMatchObject({ grade: '4', estilo: 'sem_caixa', politica: 'medio' });
    expect(g.json.campanha.itens.map((i: any) => i.nome)).toEqual(['Arroz 5kg', 'Feijão 1kg']);
    expect(g.json.campanha.itens[1]).not.toHaveProperty('campo_inventado');
  });
  it('recusa grade e estilo que não existem', async () => {
    expect((await req('PUT', '/campanhas/' + camp, { tema: { grade: '7' } }, S.A)).status).toBe(400);
    expect((await req('PUT', '/campanhas/' + camp, { tema: { estilo: 'qualquer' } }, S.A)).status).toBe(400);
  });
  it('autosave antigo não sobrescreve versão mais nova', async () => {
    const g = await req('GET', '/campanhas/' + camp, undefined, S.A);
    const v = g.json.campanha.atualizado_em;
    const r1 = await req('PUT', '/campanhas/' + camp, { nome: 'Versão A', versao: v }, S.A);
    expect(r1.status).toBe(200);
    const r2 = await req('PUT', '/campanhas/' + camp, { nome: 'Versão B (atrasada)', versao: v }, S.A);
    expect(r2.status).toBe(409);
    expect((await req('GET', '/campanhas/' + camp, undefined, S.A)).json.campanha.nome).toBe('Versão A');
  });
  it('duplicar copia tema e itens ("salvar como")', async () => {
    const r = await req('POST', '/campanhas', { nome: 'Cópia', duplicar_de: camp }, S.A);
    const g = await req('GET', '/campanhas/' + r.json.id, undefined, S.A);
    expect(g.json.campanha.tema.grade).toBe('4');
    expect(g.json.campanha.itens).toHaveLength(2);
  });
  it('cliente B não vê, não edita e não duplica a campanha do A', async () => {
    expect((await req('GET', '/campanhas/' + camp, undefined, S.B)).status).toBe(404);
    expect((await req('PUT', '/campanhas/' + camp, { nome: 'x' }, S.B)).status).toBe(404);
    expect((await req('POST', '/campanhas', { nome: 'x', duplicar_de: camp }, S.B)).status).toBe(404);
    expect((await req('GET', '/campanhas', undefined, S.B)).json.campanhas).toHaveLength(0);
  });
  it('limite de produtos por campanha', async () => {
    const muitos = Array.from({ length: 61 }, (_, i) => ({ nome: 'P' + i, preco: '1,00' }));
    expect((await req('PUT', '/campanhas/' + camp, { itens: muitos }, S.A)).status).toBe(400);
  });
  it('sem o módulo encarte, nada de campanhas', async () => {
    await req('PUT', `/admin/clientes/${S.TB}/modulos/encarte`, { ativo: false }, S.SUPER);
    const r = await req('GET', '/campanhas', undefined, S.B);
    expect(r.status).toBe(403); expect(r.json.erro).toBe('modulo_bloqueado');
    await req('PUT', `/admin/clientes/${S.TB}/modulos/encarte`, { ativo: null }, S.SUPER);
  });
});

describe('logo por loja', () => {
  it('liga uma logo do banco à loja, e a campanha da loja traz a logo', async () => {
    const logo = (await enviar(S.A, PNG_1x1, 'image/png', 'tipo=logo&nome=logo-loja-1')).json.id;
    const loja = (await req('POST', '/lojas', { nome: 'Loja 1 - Rio de Janeiro' }, S.A)).json.id;
    expect((await req('PUT', '/lojas/' + loja, { logo_asset_id: logo }, S.A)).status).toBe(200);
    await req('PUT', '/campanhas/' + camp, { loja_id: loja }, S.A);
    const g = await req('GET', '/campanhas/' + camp, undefined, S.A);
    expect(g.json.campanha.loja_logo_id).toBe(logo);
  });
  it('não aceita como logo uma foto de produto nem a logo de outro cliente', async () => {
    const loja = (await req('GET', '/lojas', undefined, S.A)).json.lojas[0].id;
    const foto = (await enviar(S.A, PNG_1x1, 'image/png', 'tipo=produto&nome=foto')).json.id;
    expect((await req('PUT', '/lojas/' + loja, { logo_asset_id: foto }, S.A)).status).toBe(400);
    const logoB = (await enviar(S.B, PNG_1x1, 'image/png', 'tipo=logo&nome=logo-b')).json.id;
    expect((await req('PUT', '/lojas/' + loja, { logo_asset_id: logoB }, S.A)).status).toBe(400);
  });
});

describe('rodapé da campanha', () => {
  it('guarda blocos, cores e personagem, e limpa o que não serve', async () => {
    const id = (await req('POST', '/campanhas', { nome: 'Rodapé' }, S.A)).json.id;
    const r = await req('PUT', '/campanhas/' + id, { validade_de: '2026-11-01', validade_ate: '2026-11-07', tema: { grade: '9', rodape: {
      transparente: false, cor_fundo: '#0057b8', cor_texto: 'azul', personagem_id: 'x',
      blocos: [{ texto: 'CONSULTE LIMITE POR CPF', negrito: true, tamanho: 9, alinhar: 'diagonal' }, { texto: 'VÁLIDAS DE {de} A {ate}', tamanho: 0.7 }] } } }, S.A);
    expect(r.status).toBe(200);
    const c = (await req('GET', '/campanhas/' + id, undefined, S.A)).json.campanha;
    expect(c).toMatchObject({ validade_de: '2026-11-01', validade_ate: '2026-11-07' });
    expect(c.tema.rodape).toMatchObject({ cor_fundo: '#0057b8', cor_texto: null, personagem_id: null,
      blocos: [{ negrito: true, tamanho: 3, alinhar: 'centro' }, { tamanho: 0.7, negrito: false }] });
  });
  it('recusa mais de 8 blocos', async () => {
    const id = (await req('POST', '/campanhas', { nome: 'R2' }, S.A)).json.id;
    const blocos = Array.from({ length: 9 }, () => ({ texto: 'x' }));
    expect((await req('PUT', '/campanhas/' + id, { tema: { rodape: { blocos } } }, S.A)).status).toBe(400);
  });
});

describe('camadas e logo', () => {
  it('guarda imagens soltas presas ou não a um produto, e o ajuste da logo', async () => {
    const id = (await req('POST', '/campanhas', { nome: 'Camadas' }, S.A)).json.id;
    const a = '11111111-2222-4333-8444-555555555555';
    const r = await req('PUT', '/campanhas/' + id, { tema: { grade: '9', logo: { escala: 9, dx: 0.1, dy: 0 }, camadas: [
      { id: 'c1', asset_id: a, x: 0.3, y: 0.4, w: 0.2, rot: 15, atras: true },
      { id: 'c2', asset_id: a, x: 9, y: 0.5, w: 0.5, ancora: 2, extra: 'x' },
      { id: 'c3', asset_id: a, ancora: 999 }] } }, S.A);
    expect(r.status).toBe(200);
    const t = (await req('GET', '/campanhas/' + id, undefined, S.A)).json.campanha.tema;
    expect(t.logo).toEqual({ escala: 3, dx: 0.1, dy: 0 });
    expect(t.camadas).toHaveLength(3);
    expect(t.camadas[0]).toMatchObject({ id: 'c1', atras: true, rot: 15, ancora: null });
    expect(t.camadas[1]).toMatchObject({ x: 1.5, ancora: 2 }); expect(t.camadas[1]).not.toHaveProperty('extra');
    expect(t.camadas[2].ancora).toBeNull();
  });
  it('recusa camada sem arquivo', async () => {
    const id = (await req('POST', '/campanhas', { nome: 'C2' }, S.A)).json.id;
    expect((await req('PUT', '/campanhas/' + id, { tema: { camadas: [{ x: 0.5 }] } }, S.A)).status).toBe(400);
  });
});

describe('tamanhos e cores gerais', () => {
  it('guarda escalas presas e só cores válidas', async () => {
    const id = (await req('POST', '/campanhas', { nome: 'Cores' }, S.A)).json.id;
    await req('PUT', '/campanhas/' + id, { tema: { escala_nome: 2, escala_preco: 0.8, cores: { caixa_preco: '#0057b8', texto_preco: 'azul', inventada: '#000000' } } }, S.A);
    const t = (await req('GET', '/campanhas/' + id, undefined, S.A)).json.campanha.tema;
    expect(t).toMatchObject({ escala_nome: 1.5, escala_preco: 0.8, cores: { caixa_preco: '#0057b8' } });
    expect(t.cores).not.toHaveProperty('texto_preco'); expect(t.cores).not.toHaveProperty('inventada');
  });
});
