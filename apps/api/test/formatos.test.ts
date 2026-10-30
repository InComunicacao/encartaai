// Formatos de vídeo do cliente (painéis de LED e TVs).
import { describe, it, expect, beforeAll } from 'vitest';
import { req, enviar, montarCenario, PNG_1x1 } from './util';

let S: Awaited<ReturnType<typeof montarCenario>>;
beforeAll(async () => { S = await montarCenario(); });

const painel = { nome: 'LED da fachada', w: 720, h: 480, fundo: 'arte', max_produtos: 4, dur_max: 20 };

describe('formatos de vídeo', () => {
  let id: string;
  it('cadastra, lista, edita e apaga', async () => {
    const r = await req('POST', '/formatos-video', painel, S.A);
    expect(r.status).toBe(201); id = r.json.id;
    const l = await req('GET', '/formatos-video', undefined, S.A);
    expect(l.json.formatos[0]).toMatchObject({ nome: 'LED da fachada', w: 720, h: 480, rotacao: 0, max_produtos: 4, dur_max: 20, layout: null });
    expect((await req('PUT', '/formatos-video/' + id, { ...painel, nome: 'LED fachada', rotacao: -90, animacao: 'passagem' }, S.A)).status).toBe(200);
    expect((await req('GET', '/formatos-video', undefined, S.A)).json.formatos[0]).toMatchObject({ nome: 'LED fachada', rotacao: -90, animacao: 'passagem' });
  });
  it('recusa medida ímpar, fora dos limites e valores desconhecidos', async () => {
    for (const ruim of [{ w: 601 }, { h: 30 }, { w: 5000 }, { rotacao: 45 }, { layout: 'diagonal' }, { animacao: 'girar' }, { dur_produto: 0 }, { nome: '' }]) {
      const r = await req('POST', '/formatos-video', { ...painel, ...ruim }, S.A);
      expect(r.status, JSON.stringify(ruim)).toBe(400);
    }
  });
  it('arte do painel: só fundo/tema do próprio cliente', async () => {
    const meu = (await enviar(S.A, PNG_1x1, 'image/png', 'tipo=fundo&nome=arte-led')).json.id;
    const foto = (await enviar(S.A, PNG_1x1, 'image/png', 'tipo=produto&nome=foto')).json.id;
    const deB = (await enviar(S.B, PNG_1x1, 'image/png', 'tipo=fundo&nome=arte-b')).json.id;
    expect((await req('POST', '/formatos-video', { ...painel, arte_asset_id: meu }, S.A)).status).toBe(201);
    expect((await req('POST', '/formatos-video', { ...painel, arte_asset_id: foto }, S.A)).status).toBe(400);
    expect((await req('POST', '/formatos-video', { ...painel, arte_asset_id: deB }, S.A)).status).toBe(400);
  });
  it('cliente sem o módulo vídeo não acessa; outro cliente não vê nem apaga', async () => {
    expect((await req('GET', '/formatos-video', undefined, S.B)).json.erro).toBe('modulo_bloqueado');
    await req('PUT', `/admin/clientes/${S.TB}/modulos/video`, { ativo: true }, S.SUPER);
    expect((await req('GET', '/formatos-video', undefined, S.B)).json.formatos).toHaveLength(0);
    expect((await req('DELETE', '/formatos-video/' + id, {}, S.B)).status).toBe(404);
    await req('PUT', `/admin/clientes/${S.TB}/modulos/video`, { ativo: null }, S.SUPER);
    expect((await req('DELETE', '/formatos-video/' + id, {}, S.A)).status).toBe(200);
  });
  it('exportação de vídeo conta no consumo só com o módulo', async () => {
    expect((await req('POST', '/exportacoes/video', {}, S.A)).status).toBe(200);
    expect((await req('POST', '/exportacoes/video', {}, S.B)).status).toBe(403);
  });
});
