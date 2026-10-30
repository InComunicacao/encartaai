// Banco de imagens, produtos, correlação e kit da marca.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { req, enviar, montarCenario, PNG_1x1, JPEG_64x32, WOFF2, HTML_DISFARCADO } from './util';
import { normalizarApelido, palavras, pontuar } from '../src/lib/correlacao';

let S: Awaited<ReturnType<typeof montarCenario>>;
beforeAll(async () => { S = await montarCenario(); });

describe('envio de arquivos', () => {
  it('PNG entra, com tipo e dimensões lidos do próprio arquivo', async () => {
    const r = await enviar(S.A, PNG_1x1, 'image/png', 'tipo=logo&nome=logo-tere.png');
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ mime: 'image/png', largura: 1, altura: 1, nome: 'logo-tere' });
  });
  it('JPEG: dimensões lidas do cabeçalho', async () => {
    const r = await enviar(S.A, JPEG_64x32, 'image/jpeg', 'tipo=produto&nome=arroz.jpg');
    expect(r.json).toMatchObject({ largura: 64, altura: 32 });
  });
  it('HTML com nome de imagem é recusado (o tipo vem dos bytes, não do nome)', async () => {
    const r = await enviar(S.A, HTML_DISFARCADO, 'image/png', 'tipo=produto&nome=foto.png');
    expect(r.status).toBe(415);
  });
  it('fonte só entra como tipo fonte, e imagem não entra como fonte', async () => {
    expect((await enviar(S.A, WOFF2, 'font/woff2', 'tipo=fonte&nome=Minha.woff2')).status).toBe(201);
    expect((await enviar(S.A, PNG_1x1, 'image/png', 'tipo=fonte&nome=x')).status).toBe(415);
    expect((await enviar(S.A, WOFF2, 'font/woff2', 'tipo=produto&nome=x')).status).toBe(415);
  });
  it('o arquivo vai para a pasta do cliente no R2', async () => {
    const r = await enviar(S.A, PNG_1x1, 'image/png', 'tipo=selo&nome=selo');
    const a = await env.DB.prepare('SELECT r2_chave FROM assets WHERE id = ?').bind(r.json.id).first<{ r2_chave: string }>();
    expect(a!.r2_chave).toBe(`tenants/${S.TA}/selo/${r.json.id}.png`);
    expect(await env.ARQUIVOS.head(a!.r2_chave)).not.toBeNull();
  });
  it('operador não envia arquivo', async () => {
    await req('PUT', `/admin/clientes/${S.TA}`, { acessos_extras: 2 }, S.SUPER);
    await req('POST', '/usuarios', { email: 'op@tere.test', nome: 'Op', senha: 'senha-op-123', papel: 'operador' }, S.A);
    const op = (await req('POST', '/auth/entrar', { email: 'op@tere.test', senha: 'senha-op-123' })).cookie;
    expect((await enviar(op, PNG_1x1, 'image/png', 'tipo=produto&nome=x')).status).toBe(403);
  });
});

describe('quem vê o quê', () => {
  let idA: string, gotham: string, globalLivre: string;
  beforeAll(async () => {
    idA = (await enviar(S.A, PNG_1x1, 'image/png', 'tipo=produto&nome=so-do-A')).json.id;
    gotham = (await enviar(S.SUPER, WOFF2, 'font/woff2', 'tipo=fonte&nome=Gotham Ultra&etiquetas=modulo:fonte_gotham', true)).json.id;
    globalLivre = (await enviar(S.SUPER, PNG_1x1, 'image/png', 'tipo=selo&nome=Oferta Especial', true)).json.id;
  });
  it('cliente B não lista nem baixa o arquivo do A', async () => {
    const lista = await req('GET', '/assets?tipo=produto', undefined, S.B);
    expect(lista.json.assets.map((a: any) => a.id)).not.toContain(idA);
    expect((await req('GET', `/assets/${idA}/arquivo`, undefined, S.B)).status).toBe(404);
  });
  it('o dono baixa o próprio arquivo, com cabeçalhos que impedem rodar como página', async () => {
    const r = await req('GET', `/assets/${idA}/arquivo`, undefined, S.A);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('content-security-policy')).toContain('sandbox');
    expect(r.bytes!.length).toBe(PNG_1x1.length);
  });
  it('banco global aparece para todos', async () => {
    expect((await req('GET', '/assets?tipo=selo', undefined, S.B)).json.assets.map((a: any) => a.id)).toContain(globalLivre);
  });
  it('Gotham (global com modulo:fonte_gotham) só para quem tem o módulo', async () => {
    const a = await req('GET', '/assets?tipo=fonte', undefined, S.A);
    const b = await req('GET', '/assets?tipo=fonte', undefined, S.B);
    expect(a.json.assets.map((x: any) => x.id)).toContain(gotham);
    expect(b.json.assets.map((x: any) => x.id)).not.toContain(gotham);
    expect((await req('GET', `/assets/${gotham}/arquivo`, undefined, S.B)).status).toBe(404);
  });
  it('cliente não apaga arquivo global', async () => {
    expect((await req('DELETE', `/assets/${globalLivre}`, {}, S.A)).status).toBe(404);
  });
});

describe('exclusão protegida', () => {
  it('arquivo em uso: avisa onde, e só apaga com confirmação', async () => {
    const foto = (await enviar(S.A, PNG_1x1, 'image/png', 'tipo=produto&nome=coca 7894900011517.png')).json;
    expect(foto.produto_id).toBeTruthy();                      // vinculou pelo EAN do nome
    const r1 = await req('DELETE', `/assets/${foto.id}`, {}, S.A);
    expect(r1.status).toBe(409);
    expect(r1.json.usos).toEqual([{ onde: 'produto', nome: 'coca' }]);
    const r2 = await req('DELETE', `/assets/${foto.id}`, { confirmar: true }, S.A);
    expect(r2.status).toBe(200);
    const a = await env.DB.prepare('SELECT 1 FROM assets WHERE id = ?').bind(foto.id).first();
    expect(a).toBeNull();
  });
});

describe('produtos e correlação', () => {
  let coca2l: string, coca350: string, arroz: string;
  beforeAll(async () => {
    coca2l = (await req('POST', '/produtos', { nome: 'Refrigerante Coca-Cola 2L', ean: '7894900027013' }, S.A)).json.id;
    coca350 = (await req('POST', '/produtos', { nome: 'Refrigerante Coca-Cola Lata 350ml' }, S.A)).json.id;
    arroz = (await req('POST', '/produtos', { nome: 'Arroz Tio João Tipo 1 5kg' }, S.A)).json.id;
    await req('POST', '/produtos', { nome: 'Feijão Camil Carioca 1kg' }, S.A);
  });
  it('EAN repetido no mesmo cliente é recusado', async () => {
    expect((await req('POST', '/produtos', { nome: 'X', ean: '7894900027013' }, S.A)).status).toBe(409);
  });
  it('EAN acerta direto', async () => {
    const r = await req('POST', '/banco/sugerir', { itens: [{ texto: 'qualquer coisa', ean: '7894900027013' }] }, S.A);
    expect(r.json.resultados[0]).toMatchObject({ status: 'ean', produto: { id: coca2l } });
  });
  it('sem EAN, sugere as melhores por palavras', async () => {
    const r = await req('POST', '/banco/sugerir', { itens: [{ texto: 'ARROZ TIO JOAO 5KG' }, { texto: 'pneu aro 13' }] }, S.A);
    expect(r.json.resultados[0].status).toBe('sugestao');
    expect(r.json.resultados[0].candidatos[0].id).toBe(arroz);
    expect(r.json.resultados[1].status).toBe('nenhum');
  });
  it('depois de confirmado, o mesmo texto acerta direto pelo apelido', async () => {
    await req('POST', '/banco/confirmar', { texto: 'COCA LATA 350 ML', produto_id: coca350 }, S.A);
    const r = await req('POST', '/banco/sugerir', { itens: [{ texto: 'coca lata 350ml' }] }, S.A);
    expect(r.json.resultados[0]).toMatchObject({ status: 'apelido', produto: { id: coca350 } });
  });
  it('apelido de um cliente não vale no outro', async () => {
    const r = await req('POST', '/banco/sugerir', { itens: [{ texto: 'coca lata 350ml' }] }, S.B);
    expect(r.json.resultados[0].status).toBe('nenhum');
  });
  it('não confirma apelido para produto de outro cliente', async () => {
    expect((await req('POST', '/banco/confirmar', { texto: 'x', produto_id: arroz }, S.B)).status).toBe(404);
  });
  it('normalização: acento, caixa e "2 L" = "2l"', () => {
    expect(normalizarApelido('Refrigerante  COCA-COLA 2 L')).toBe('refrigerante coca cola 2l');
    expect(palavras('Feijão Camil 1kg')).toEqual(['feijao', 'camil']);
    expect(pontuar(['refrig', 'coca'], ['refrigerante', 'coca', 'cola'])).toBeGreaterThan(0.6);
  });
});

describe('kit da marca', () => {
  it('salva fontes do Google, cores e textos', async () => {
    const kit = { fontes: { preco: { origem: 'google', familia: 'Anton' }, nome: { origem: 'google', familia: 'Oswald', peso: 600 } },
      cores: { caixa_preco: '#E40010', texto_preco: '#ffffff' }, textos: { rodape: 'Ofertas válidas enquanto durarem os estoques.' },
      campo_inventado: 'x' };
    const r = await req('PUT', '/kit', kit, S.A);
    expect(r.status).toBe(200);
    expect(r.json.kit.cores.caixa_preco).toBe('#e40010');
    expect(r.json.kit).not.toHaveProperty('campo_inventado');
    expect((await req('GET', '/kit', undefined, S.A)).json.kit.fontes.preco.familia).toBe('Anton');
  });
  it('recusa cor fora do formato e nome de família com código', async () => {
    expect((await req('PUT', '/kit', { cores: { primaria: 'red' } }, S.A)).json.campo).toBe('cores.primaria');
    expect((await req('PUT', '/kit', { fontes: { nome: { origem: 'google', familia: "Anton'); }</style>" } } }, S.A)).status).toBe(400);
  });
  it('Gotham no kit: Completo pode, Básico não', async () => {
    const gotham = (await req('GET', '/assets?tipo=fonte&q=Gotham', undefined, S.A)).json.assets[0].id;
    const kit = { fontes: { preco: { origem: 'arquivo', familia: 'Gotham Ultra', asset_id: gotham } } };
    expect((await req('PUT', '/kit', kit, S.A)).status).toBe(200);
    const b = await req('PUT', '/kit', kit, S.B);
    expect(b.status).toBe(403); expect(b.json.erro).toBe('arquivo_indisponivel');
  });
  it('kit de um cliente não aparece no outro', async () => {
    expect((await req('GET', '/kit', undefined, S.B)).json.kit).toEqual({});
  });
});
