// Vídeo e LED: a mesma campanha do encarte vira vídeo MP4 para Stories,
// TV e os painéis de LED de cada loja. A prévia e o arquivo saem do mesmo
// desenho (desenharQuadroVideo) — a prévia anda no relógio, a gravação
// quadro a quadro.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DUR_PRODUTO_PADRAO, ESTILOS, FORMATOS_VIDEO_PADRAO, VIDEO_FPS, desenharQuadroVideo, duracaoVideo, layoutDe,
  limiteProdutos, totalQuadros, type AnimacaoVideo, type CenaVideo, type Ctx2D, type FormatoVideo, type FundoVideo, type Item, type PoliticaTexto } from '@encartaai/render';
import { api, ErroApi, type Asset } from '../api';
import { useSessao } from '../App';
import { Aviso, Modal } from '../componentes/Modal';
import { carregarFonte, carregarImagem, itemDoMotor, kitDoCliente, rodapeDoMotor, rodapePadrao, type ItemCampanha, type KitApi, type RodapeApi } from '../render-web';
import { gravarMp4, podeGravarMp4 } from '../video/gravador';

type ItemC = ItemCampanha;
interface Camp { id: string; nome: string; loja_id: string | null; validade_de: string | null; validade_ate: string | null;
  tema: { estilo: string; politica: PoliticaTexto; fundo_id: string | null; rodape?: RodapeApi }; itens: ItemC[] }
interface Linha { id: string; nome: string; itens: number }
interface Loja { id: string; nome: string; logo_asset_id: string | null; rodape_texto: string | null }
export interface FormatoApi { id: string; nome: string; w: number; h: number; rotacao: 0 | 90 | -90; layout: 'card' | 'faixa' | null;
  animacao: AnimacaoVideo | null; fundo: FundoVideo; arte_asset_id: string | null; dur_produto: number | null; max_produtos: number | null; dur_max: number | null }

const doCliente = (f: FormatoApi): FormatoVideo => ({
  id: 'c:' + f.id, nome: f.nome, grupo: 'Painéis e TVs das lojas', w: f.w, h: f.h, rotacao: f.rotacao || 0, fundo: f.fundo,
  layout: f.layout ?? undefined, animacao: f.animacao ?? undefined, durProduto: f.dur_produto ?? undefined,
  maxProdutos: f.max_produtos ?? undefined, durMax: f.dur_max ?? undefined, arteId: f.arte_asset_id,
});
const NOME_ANIM: Record<AnimacaoVideo, string> = { deslizar: 'Deslizar (entra pela direita)', passagem: 'Passagem (linear, sem fade)', surgir: 'Surgir (só fade)' };
const nomeArquivo = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'video';

export function Video() {
  const { eu } = useSessao();
  const edita = eu?.usuario.papel === 'dono' || eu?.usuario.papel === 'editor';
  const [params, setParams] = useSearchParams();
  const [campanhas, setCampanhas] = useState<Linha[] | null>(null);
  const [camp, setCamp] = useState<Camp | null>(null);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [kitApi, setKitApi] = useState<KitApi>({});
  const [fundos, setFundos] = useState<Asset[]>([]);
  const [meus, setMeus] = useState<FormatoApi[]>([]);
  const [formatoId, setFormatoId] = useState(FORMATOS_VIDEO_PADRAO[0].id);
  const [fundo, setFundo] = useState<FundoVideo>('encarte');
  const [arteId, setArteId] = useState<string | null>(null);
  const [cor, setCor] = useState('#0f9f4f');
  const [anim, setAnim] = useState<AnimacaoVideo>('deslizar');
  const [dur, setDur] = useState(DUR_PRODUTO_PADRAO);
  const [marcados, setMarcados] = useState<boolean[]>([]);
  const [editar, setEditar] = useState<FormatoApi | 'novo' | null>(null);
  const [gravando, setGravando] = useState<{ pct: number } | null>(null);
  const [erro, setErro] = useState('');
  const cancelar = useRef(false);
  const campId = params.get('campanha');

  const carregarFormatos = useCallback(async () => setMeus((await api.get<{ formatos: FormatoApi[] }>('/formatos-video')).formatos), []);
  useEffect(() => {
    (async () => {
      const [c, l, k, f1, f2] = await Promise.all([api.get<{ campanhas: Linha[] }>('/campanhas'), api.get<{ lojas: Loja[] }>('/lojas'),
        api.get<{ kit: KitApi }>('/kit'), api.get<{ assets: Asset[] }>('/assets?tipo=fundo'), api.get<{ assets: Asset[] }>('/assets?tipo=tema')]);
      setCampanhas(c.campanhas); setLojas(l.lojas); setKitApi(k.kit); setFundos([...f1.assets, ...f2.assets]);
      if (k.kit.cores?.primaria) setCor(k.kit.cores.primaria);
    })();
    carregarFormatos();
  }, [carregarFormatos]);
  useEffect(() => {
    if (!campId) { setCamp(null); return; }
    api.get<{ campanha: Camp }>('/campanhas/' + campId).then((r) => setCamp(r.campanha)).catch(() => setParams({}));
  }, [campId, setParams]);

  const formatos = useMemo(() => [...FORMATOS_VIDEO_PADRAO, ...meus.map(doCliente)], [meus]);
  const formato = formatos.find((f) => f.id === formatoId) || formatos[0];
  // Ao trocar de formato, aplica as sugestões dele (o usuário pode mudar depois).
  useEffect(() => {
    setFundo(formato.fundo); setAnim(formato.animacao ?? (layoutDe(formato) === 'faixa' ? 'passagem' : 'deslizar'));
    setDur(formato.durProduto ?? DUR_PRODUTO_PADRAO); setArteId(formato.arteId ?? null);
  }, [formato]);
  const limite = limiteProdutos(formato, dur);
  useEffect(() => {      // marca os primeiros que cabem
    if (!camp) return;
    let n = 0;   // os primeiros que cabem, pulando os ocultos no encarte
    setMarcados(camp.itens.map((it) => !it.oculto && !!it.nome.trim() && n++ < limite));
  }, [camp, limite]);
  const escolhidos = camp ? camp.itens.filter((_, i) => marcados[i]) : [];
  const excedeu = escolhidos.length > limite;

  // ── cena: carrega fontes e imagens antes de desenhar ──
  const [cena, setCena] = useState<CenaVideo | null>(null);
  useEffect(() => {
    if (!camp) { setCena(null); return; }
    let vivo = true;
    (async () => {
      const { kit, fontes } = kitDoCliente(kitApi);
      const loja = lojas.find((l) => l.id === camp.loja_id), logoId = loja?.logo_asset_id;
      const rodape = await rodapeDoMotor(camp.tema.rodape ?? rodapePadrao(kitApi), { de: camp.validade_de, ate: camp.validade_ate, loja: loja?.nome, lojaTexto: loja?.rodape_texto });
      const fundoId = fundo === 'encarte' ? camp.tema.fundo_id : fundo === 'arte' ? arteId : null;
      const [img, logo, todos] = await Promise.all([carregarImagem(fundoId), carregarImagem(logoId),
        Promise.all(escolhidos.slice(0, limite).map(itemDoMotor)), ...fontes.map(carregarFonte)]);
      const itens: Item[] = todos.map((i) => ({ ...i, oculto: false }));
      if (vivo) setCena({ formato, kit, estilo: ESTILOS[camp.tema.estilo] || ESTILOS.etiqueta_vermelha, politica: camp.tema.politica, itens,
        fundo, fundoImagem: img as any, corFundo: cor, logo: logo as any, rodape, durProduto: dur, animacao: anim });
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camp, kitApi, lojas, formato, fundo, arteId, cor, anim, dur, marcados.join(','), limite]);

  // ── prévia animada ──
  const tela = useRef<HTMLCanvasElement>(null);
  const [tocando, setTocando] = useState(true);
  const [tempo, setTempo] = useState(0);
  const escalaPrevia = Math.min(420 / formato.w, 520 / formato.h, 1);
  useEffect(() => {
    const cv = tela.current;
    if (!cv || !cena) return;
    const ctx = cv.getContext('2d')!;
    const total = Math.max(duracaoVideo(cena), 0.001);
    let raf = 0, inicio = performance.now() - tempo * 1000;
    const quadro = (agora: number) => {
      const t = tocando ? ((agora - inicio) / 1000) % total : tempo;
      ctx.setTransform(escalaPrevia, 0, 0, escalaPrevia, 0, 0);
      ctx.clearRect(0, 0, formato.w, formato.h);
      desenharQuadroVideo(ctx as unknown as Ctx2D, cena, t);
      if (tocando) { setTempo(t); raf = requestAnimationFrame(quadro); }
    };
    raf = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cena, tocando, escalaPrevia]);

  async function exportar() {
    if (!cena || !camp) return;
    setErro('');
    try {
      await api.post('/exportacoes/video');
      const cv = document.createElement('canvas'); cv.width = formato.w; cv.height = formato.h;
      const ctx = cv.getContext('2d', { alpha: false })!;
      cancelar.current = false; setGravando({ pct: 0 });
      const blob = await gravarMp4(cv, totalQuadros(cena), (i) => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        desenharQuadroVideo(ctx as unknown as Ctx2D, cena, i / VIDEO_FPS);
      }, (p) => setGravando({ pct: Math.round((p.quadro / p.total) * 100) }), () => cancelar.current);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `${nomeArquivo(camp.nome)} - ${nomeArquivo(formato.nome)}.mp4`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (x) {
      if (!(x instanceof DOMException && x.name === 'AbortError')) setErro(x instanceof ErroApi || x instanceof Error ? x.message : 'Não foi possível gerar o vídeo.');
    } finally { setGravando(null); }
  }

  async function apagarFormato(f: FormatoApi) {
    if (!confirm(`Apagar o formato "${f.nome}"?`)) return;
    try { await api.del('/formatos-video/' + f.id); if (formatoId === 'c:' + f.id) setFormatoId(FORMATOS_VIDEO_PADRAO[0].id); await carregarFormatos(); }
    catch (x) { setErro(x instanceof ErroApi ? x.message : 'Falhou.'); }
  }

  // ── sem campanha escolhida: lista para escolher ──
  if (!campId) return (
    <>
      <h1>Vídeo e LED</h1>
      <p className="sub">Escolha a campanha. Os produtos e preços vêm dela; aqui você escolhe o formato e exporta o MP4.</p>
      {!podeGravarMp4() && <div className="aviso">Este navegador não grava MP4. Use o Chrome ou o Edge atualizados.</div>}
      <div className="cartao" style={{ padding: 0 }}>
        {campanhas?.length === 0 && <div className="vazio">Nenhuma campanha ainda. <Link to="/encarte">Crie uma em Encarte</Link>.</div>}
        {campanhas && campanhas.length > 0 && <table><tbody>{campanhas.map((c) => (
          <tr key={c.id}><td><button className="discreto" onClick={() => setParams({ campanha: c.id })}><strong>{c.nome}</strong></button></td>
            <td>{c.itens} produtos</td></tr>))}</tbody></table>}
      </div>
      <Formatos meus={meus} edita={edita} aoEditar={setEditar} aoApagar={apagarFormato} />
      {editar && <EditarFormato formato={editar === 'novo' ? null : editar} fundos={fundos} aoFechar={() => setEditar(null)}
        aoSalvar={async () => { setEditar(null); await carregarFormatos(); }} />}
    </>
  );

  if (!camp) return <p>Carregando…</p>;
  const grupos = [...new Set(formatos.map((f) => f.grupo))];
  const segundos = escolhidos.slice(0, limite).length * dur;

  return (
    <>
      <p><button className="discreto" onClick={() => setParams({})}>← Campanhas</button> · <Link to={'/encarte/' + camp.id}>Editar produtos</Link></p>
      <div className="cabecalho">
        <div><h1>{camp.nome}</h1><p className="sub" style={{ marginBottom: 0 }}>
          {formato.w}×{formato.h}{formato.rotacao ? ` · girado ${formato.rotacao}°` : ''} · {escolhidos.slice(0, limite).length} produtos · {segundos}s</p></div>
        <button className="primario" onClick={exportar} disabled={!cena || !cena.itens.length || !!gravando || excedeu}>Exportar MP4</button>
      </div>
      <Aviso>{erro}</Aviso>

      <div className="editor">
        <div>
          <div className="cartao">
            <label>Formato<select value={formato.id} onChange={(e) => setFormatoId(e.target.value)}>
              {grupos.map((g) => <optgroup key={g} label={g}>{formatos.filter((f) => f.grupo === g).map((f) =>
                <option key={f.id} value={f.id}>{f.nome} — {f.w}×{f.h}</option>)}</optgroup>)}</select></label>
            {formato.descricao && <p className="sub" style={{ marginTop: -8 }}>{formato.descricao}</p>}
            <div className="grade-2">
              <label>Fundo<select value={fundo} onChange={(e) => setFundo(e.target.value as FundoVideo)}>
                <option value="encarte">Fundo do encarte (tema, logo e rodapé)</option>
                <option value="arte">Arte do banco de imagens</option><option value="cor">Cor sólida</option></select></label>
              {fundo === 'arte' && <label>Arte<select value={arteId || ''} onChange={(e) => setArteId(e.target.value || null)}>
                <option value="">Escolha…</option>{fundos.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>}
              {fundo !== 'encarte' && <label>Cor de fundo<input type="color" value={cor} onChange={(e) => setCor(e.target.value)} /></label>}
              <label>Animação<select value={anim} onChange={(e) => setAnim(e.target.value as AnimacaoVideo)}>
                {(Object.keys(NOME_ANIM) as AnimacaoVideo[]).map((a) => <option key={a} value={a}>{NOME_ANIM[a]}</option>)}</select></label>
              <label>Segundos por produto<input type="number" min={2} max={30} step={0.5} value={dur}
                onChange={(e) => setDur(Math.min(30, Math.max(2, Number(e.target.value) || DUR_PRODUTO_PADRAO)))} /></label>
            </div>
          </div>

          <div className="cartao" style={{ padding: 0 }}>
            <div className="linha" style={{ padding: '12px 14px' }}>
              <strong>Produtos no vídeo ({escolhidos.length}/{limite})</strong><span className="espaco" />
              <button className="discreto" onClick={() => setMarcados(camp.itens.map((_, i) => i < limite))}>Primeiros {limite}</button>
              <button className="discreto" onClick={() => setMarcados(camp.itens.map(() => false))}>Nenhum</button>
            </div>
            {excedeu && <div className="aviso" style={{ margin: '0 14px 10px' }}>
              Este formato aceita até {limite} produtos{formato.durMax ? ` (${formato.durMax}s no máximo)` : ''}. Desmarque {escolhidos.length - limite}.</div>}
            {camp.itens.length === 0 && <div className="vazio">A campanha está sem produtos. <Link to={'/encarte/' + camp.id}>Adicione no editor</Link>.</div>}
            <table className="tabela-itens"><tbody>{camp.itens.map((it, i) => (
              <tr key={i}><td style={{ width: 36 }}><input type="checkbox" aria-label={'Incluir ' + it.nome} checked={!!marcados[i]}
                onChange={(e) => setMarcados((m) => m.map((v, j) => j === i ? e.target.checked : v))} /></td>
                <td>{it.nome} <span className="sub">{it.descricao}</span></td><td style={{ textAlign: 'right' }}>{it.preco}</td></tr>))}</tbody></table>
          </div>
          <Formatos meus={meus} edita={edita} aoEditar={setEditar} aoApagar={apagarFormato} />
        </div>

        <div className="previa">
          <div className="previa-video" style={{ width: formato.w * escalaPrevia, height: formato.h * escalaPrevia }}>
            <canvas ref={tela} width={Math.round(formato.w * escalaPrevia)} height={Math.round(formato.h * escalaPrevia)} aria-label="Prévia do vídeo" />
          </div>
          <div className="linha" style={{ marginTop: 8 }}>
            <button onClick={() => setTocando((v) => !v)}>{tocando ? 'Pausar' : 'Tocar'}</button>
            <span className="sub" style={{ margin: 0 }}>{tempo.toFixed(1)}s de {segundos}s</span>
          </div>
          {formato.rotacao ? <p className="sub">A prévia mostra o arquivo como sai: deitado. Na TV de lado, ele aparece em pé.</p> : null}
        </div>
      </div>

      {gravando && (
        <Modal titulo="Gerando o vídeo" acoes={<button onClick={() => { cancelar.current = true; }}>Cancelar</button>}>
          <p>Desenhando quadro a quadro: o arquivo sai com a duração exata, mesmo se o computador for lento.</p>
          <div className="barra"><div style={{ width: gravando.pct + '%' }} /></div>
          <p className="sub" style={{ marginTop: 8 }}>{gravando.pct}%</p>
        </Modal>
      )}
      {editar && <EditarFormato formato={editar === 'novo' ? null : editar} fundos={fundos} aoFechar={() => setEditar(null)}
        aoSalvar={async () => { setEditar(null); await carregarFormatos(); }} />}
    </>
  );
}

function Formatos({ meus, edita, aoEditar, aoApagar }: { meus: FormatoApi[]; edita: boolean; aoEditar: (f: FormatoApi | 'novo') => void; aoApagar: (f: FormatoApi) => void }) {
  return (
    <div className="cartao" style={{ padding: 0 }}>
      <div className="linha" style={{ padding: '12px 14px' }}>
        <strong>Painéis e TVs das lojas</strong><span className="espaco" />
        {edita && <button onClick={() => aoEditar('novo')}>+ Formato</button>}
      </div>
      {meus.length === 0 && <div className="vazio" style={{ paddingTop: 8 }}>Cadastre o tamanho de cada painel de LED (o fornecedor informa em pixels).</div>}
      {meus.length > 0 && <table><tbody>{meus.map((f) => (
        <tr key={f.id}><td><strong>{f.nome}</strong></td><td>{f.w}×{f.h}{f.rotacao ? ` · ${f.rotacao}°` : ''}</td>
          <td>{[f.max_produtos && `até ${f.max_produtos} produtos`, f.dur_max && `${f.dur_max}s máx.`].filter(Boolean).join(' · ')}</td>
          <td style={{ textAlign: 'right' }}>{edita && <><button className="discreto" onClick={() => aoEditar(f)}>Editar</button>
            <button className="discreto perigo" onClick={() => aoApagar(f)}>Apagar</button></>}</td></tr>))}</tbody></table>}
    </div>
  );
}

function EditarFormato({ formato, fundos, aoFechar, aoSalvar }: { formato: FormatoApi | null; fundos: Asset[]; aoFechar: () => void; aoSalvar: () => void }) {
  const [f, setF] = useState<Record<string, any>>(formato ?? { nome: '', w: 1920, h: 1080, rotacao: 0, layout: '', animacao: '', fundo: 'arte',
    arte_asset_id: '', dur_produto: '', max_produtos: '', dur_max: '' });
  const [erro, setErro] = useState('');
  const m = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function salvar(e: FormEvent) {
    e.preventDefault(); setErro('');
    const corpo = { ...f, w: Number(f.w), h: Number(f.h), rotacao: Number(f.rotacao), arte_asset_id: f.arte_asset_id || null };
    try { formato ? await api.put('/formatos-video/' + formato.id, corpo) : await api.post('/formatos-video', corpo); aoSalvar(); }
    catch (x) { setErro(x instanceof ErroApi ? x.message : 'Falhou.'); }
  }
  const prop = Number(f.w) / Number(f.h || 1);
  return (
    <Modal titulo={formato ? 'Editar formato' : 'Novo formato'} aoFechar={aoFechar}>
      <form onSubmit={salvar}>
        <Aviso>{erro}</Aviso>
        <label>Nome <span className="dica">Ex.: LED da fachada - Loja 1</span><input value={f.nome} onChange={m('nome')} required autoFocus /></label>
        <div className="grade-2">
          <label>Largura (px)<input type="number" value={f.w} onChange={m('w')} min={64} max={4096} required /></label>
          <label>Altura (px)<input type="number" value={f.h} onChange={m('h')} min={64} max={4096} required /></label>
          <label>Rotação<select value={f.rotacao} onChange={m('rotacao')}><option value={0}>Nenhuma</option>
            <option value={-90}>TV de lado (−90°)</option><option value={90}>TV de lado (90°)</option></select></label>
          <label>Layout<select value={f.layout || ''} onChange={m('layout')}><option value="">Automático ({prop >= 2.6 ? 'faixa' : 'card'})</option>
            <option value="card">Card do encarte</option><option value="faixa">Faixa (lado a lado)</option></select></label>
          <label>Fundo sugerido<select value={f.fundo} onChange={m('fundo')}><option value="arte">Arte</option><option value="cor">Cor sólida</option>
            <option value="encarte">Fundo do encarte</option></select></label>
          <label>Arte do painel<select value={f.arte_asset_id || ''} onChange={m('arte_asset_id')}><option value="">Nenhuma</option>
            {fundos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></label>
          <label>Animação<select value={f.animacao || ''} onChange={m('animacao')}><option value="">Automática</option>
            {(Object.keys(NOME_ANIM) as AnimacaoVideo[]).map((a) => <option key={a} value={a}>{NOME_ANIM[a]}</option>)}</select></label>
          <label>Segundos por produto<input type="number" value={f.dur_produto ?? ''} onChange={m('dur_produto')} min={1} max={60} step={0.5} placeholder="5" /></label>
          <label>Máximo de produtos<input type="number" value={f.max_produtos ?? ''} onChange={m('max_produtos')} min={1} max={60} placeholder="Sem limite" /></label>
          <label>Duração máxima (s)<input type="number" value={f.dur_max ?? ''} onChange={m('dur_max')} min={2} placeholder="Sem limite" /></label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={aoFechar}>Cancelar</button><button className="primario">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
