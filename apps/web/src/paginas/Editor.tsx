// Editor de campanha: os produtos à esquerda, o encarte à direita,
// desenhado pelo MESMO motor que gera o PNG final — o que se vê é o que sai.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ENCARTE_VERTICAL, ESTILOS, GRADES, desenharEncarte, type Ctx2D, type Item, type PoliticaTexto } from '@encartaai/render';
import { api, ErroApi, urlArquivo, type Asset } from '../api';
import { useSessao } from '../App';
import { Aviso, Modal } from '../componentes/Modal';
import { carregarFonte, carregarImagem, kitDoCliente, lerLista, type KitApi } from '../render-web';

interface ItemEd { nome: string; descricao: string; preco: string; fator: string; foto_id: string | null; produto_id: string | null;
  candidatos?: { id: string; nome: string; foto_id: string | null; pontuacao: number }[] }
interface Tema { grade: string; estilo: string; politica: PoliticaTexto; fundo_id: string | null }
interface Camp { id: string; nome: string; loja_id: string | null; tema: Tema; itens: ItemEd[]; atualizado_em: number }
interface Loja { id: string; nome: string; logo_asset_id: string | null }

const NOMES_GRADE: Record<string, string> = { '1': '1 produto', '4': '4 produtos (2×2)', '6': '6 produtos (2×3)', '8': '8 produtos (2×4)', '9': '9 produtos (3×3)', '12': '12 produtos (3×4)' };
const vazio = (): ItemEd => ({ nome: '', descricao: '', preco: '', fator: 'UN', foto_id: null, produto_id: null });

export function Editor() {
  const { id } = useParams();
  const { eu } = useSessao();
  const operador = eu?.usuario.papel === 'operador';
  const [camp, setCamp] = useState<Camp | null>(null);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [fundos, setFundos] = useState<Asset[]>([]);
  const [kitApi, setKitApi] = useState<KitApi>({});
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'salvando' | 'erro'; texto: string }>({ tipo: 'ok', texto: '' });
  const [colar, setColar] = useState(false);
  const [foto, setFoto] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  const versao = useRef(0);
  const sujo = useRef(false);

  useEffect(() => {
    (async () => {
      const [c, l, f1, f2, k] = await Promise.all([
        api.get<{ campanha: Camp }>('/campanhas/' + id), api.get<{ lojas: Loja[] }>('/lojas'),
        api.get<{ assets: Asset[] }>('/assets?tipo=tema'), api.get<{ assets: Asset[] }>('/assets?tipo=fundo'), api.get<{ kit: KitApi }>('/kit')]);
      versao.current = c.campanha.atualizado_em;
      setCamp({ ...c.campanha, itens: c.campanha.itens.map((i) => ({ ...vazio(), ...i })) });
      setLojas(l.lojas); setFundos([...f1.assets, ...f2.assets]); setKitApi(k.kit);
    })();
  }, [id]);

  // ── autosave ──
  const salvar = useCallback(async (c: Camp) => {
    setEstado({ tipo: 'salvando', texto: 'Salvando…' });
    try {
      const corpo: Record<string, unknown> = {
        itens: c.itens.map(({ candidatos, ...i }) => i), versao: versao.current,
        ...(operador ? {} : { nome: c.nome, tema: c.tema, loja_id: c.loja_id }),
      };
      const r = await api.put<{ versao: number }>('/campanhas/' + c.id, corpo);
      versao.current = r.versao; sujo.current = false;
      setEstado({ tipo: 'ok', texto: 'Salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) });
    } catch (x) {
      setEstado({ tipo: 'erro', texto: x instanceof ErroApi ? x.message : 'Sem conexão — as mudanças não foram salvas.' });
    }
  }, [operador]);
  useEffect(() => {
    if (!camp || !sujo.current) return;
    const t = setTimeout(() => salvar(camp), 1200);
    return () => clearTimeout(t);
  }, [camp, salvar]);
  const mudar = (f: (c: Camp) => Camp) => { sujo.current = true; setCamp((c) => c && f(c)); };
  const mudarItem = (i: number, campo: keyof ItemEd, v: string) => mudar((c) => ({ ...c, itens: c.itens.map((x, j) => j === i ? { ...x, [campo]: v } : x) }));
  const mudarTema = (t: Partial<Tema>) => mudar((c) => ({ ...c, tema: { ...c.tema, ...t } }));

  // ── colar lista ──
  async function aplicarLista(texto: string, substituir: boolean) {
    const linhas = lerLista(texto);
    const novos: ItemEd[] = linhas.map((l) => ({ ...vazio(), nome: l.nome, descricao: l.descricao, preco: l.preco, fator: l.fator || 'UN' }));
    try {
      const r = await api.post<{ resultados: any[] }>('/banco/sugerir', { itens: linhas.map((l) => ({ texto: [l.nome, l.descricao].join(' ').trim(), ean: l.ean })) });
      r.resultados.forEach((res, k) => {
        if (res.produto) { novos[k].produto_id = res.produto.id; novos[k].foto_id = res.produto.foto_id; }
        else if (res.candidatos) novos[k].candidatos = res.candidatos;
      });
    } catch { /* sem banco, segue sem fotos */ }
    mudar((c) => ({ ...c, itens: substituir ? novos : [...c.itens, ...novos] }));
    setColar(false);
  }
  async function confirmarCandidato(i: number, cand: NonNullable<ItemEd['candidatos']>[number]) {
    const item = camp!.itens[i];
    await api.post('/banco/confirmar', { texto: [item.nome, item.descricao].join(' ').trim(), produto_id: cand.id }).catch(() => {});
    mudar((c) => ({ ...c, itens: c.itens.map((x, j) => j === i ? { ...x, produto_id: cand.id, foto_id: cand.foto_id, candidatos: undefined } : x) }));
  }

  // ── desenho ──
  const tela = useRef<HTMLCanvasElement>(null);
  const desenhar = useCallback(async (canvas: HTMLCanvasElement, c: Camp, escala: number) => {
    const { kit, fontes } = kitDoCliente(kitApi);
    const grade = GRADES[c.tema.grade];
    const usados = c.itens.slice(0, grade.celulas.length);
    const logoId = lojas.find((l) => l.id === c.loja_id)?.logo_asset_id;
    const [fundo, logo, ...fotos] = await Promise.all([carregarImagem(c.tema.fundo_id), carregarImagem(logoId),
      ...usados.map((i) => carregarImagem(i.foto_id)), ...fontes.map(carregarFonte)]);
    const itens: Item[] = usados.map((i, k) => ({ nome: i.nome || ' ', descricao: i.descricao, preco: i.preco, fator: i.fator, foto: fotos[k] as any }));
    const ctx = canvas.getContext('2d') as unknown as Ctx2D;
    ctx.save(); (ctx as any).setTransform(1, 0, 0, 1, 0, 0);
    desenharEncarte(ctx, { formato: ENCARTE_VERTICAL, grade, estilo: ESTILOS[c.tema.estilo], kit, itens, fundo: fundo as any, logo: logo as any, politica: c.tema.politica }, escala);
    ctx.restore();
  }, [kitApi, lojas]);
  useEffect(() => {
    if (!camp || !tela.current) return;
    let vivo = true;
    const cv = tela.current;
    const t = setTimeout(async () => {
      const off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
      await desenhar(off, camp, cv.width / ENCARTE_VERTICAL.w);
      if (vivo) cv.getContext('2d')!.drawImage(off, 0, 0);   // troca de uma vez: sem piscar
    }, 120);
    return () => { vivo = false; clearTimeout(t); };
  }, [camp, desenhar]);

  async function exportar() {
    if (!camp) return;
    setErro('');
    try {
      await api.post('/exportacoes/encarte');
      const cv = document.createElement('canvas'); cv.width = ENCARTE_VERTICAL.w; cv.height = ENCARTE_VERTICAL.h;
      await desenhar(cv, camp, 1);
      const blob: Blob = await new Promise((ok) => cv.toBlob((b) => ok(b!), 'image/png'));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = (camp.nome || 'encarte').replace(/[\\/:*?"<>|]+/g, '-') + '.png';
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (x) { setErro(x instanceof ErroApi ? x.message : 'Não foi possível exportar.'); }
  }

  if (!camp) return <p>Carregando…</p>;
  const capacidade = GRADES[camp.tema.grade].celulas.length;
  const sobrando = camp.itens.length - capacidade;

  return (
    <>
      <p><Link to="/encarte">← Encartes</Link></p>
      <div className="cabecalho">
        <div style={{ flex: 1 }}>
          <input aria-label="Nome da campanha" className="titulo-editavel" value={camp.nome} disabled={operador}
            onChange={(e) => mudar((c) => ({ ...c, nome: e.target.value }))} />
          <p className={'sub' + (estado.tipo === 'erro' ? ' texto-erro' : '')} role="status" style={{ marginBottom: 0 }}>{estado.texto || 'Tudo salvo'}</p>
        </div>
        <button className="primario" onClick={exportar}>Exportar PNG</button>
      </div>
      <Aviso>{erro}</Aviso>

      <div className="editor">
        <div>
          {!operador && (
            <div className="cartao">
              <div className="grade-2">
                <label>Grade<select value={camp.tema.grade} onChange={(e) => mudarTema({ grade: e.target.value })}>
                  {Object.keys(GRADES).map((g) => <option key={g} value={g}>{NOMES_GRADE[g]}</option>)}</select></label>
                <label>Caixa de preço<select value={camp.tema.estilo} onChange={(e) => mudarTema({ estilo: e.target.value })}>
                  {Object.values(ESTILOS).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
                <label>Loja<select value={camp.loja_id || ''} onChange={(e) => mudar((c) => ({ ...c, loja_id: e.target.value || null }))}>
                  <option value="">Sem loja</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
                <label>Tamanho do texto<select value={camp.tema.politica} onChange={(e) => mudarTema({ politica: e.target.value as PoliticaTexto })}>
                  <option value="maior">Maior possível</option><option value="medio">Médio</option><option value="minimo">Mínimo</option></select></label>
              </div>
              <label style={{ marginBottom: 0 }}>Fundo / tema
                <select value={camp.tema.fundo_id || ''} onChange={(e) => mudarTema({ fundo_id: e.target.value || null })}>
                  <option value="">Branco</option>{fundos.map((f) => <option key={f.id} value={f.id}>{f.nome}{f.global ? ' (EncartaAi)' : ''}</option>)}</select></label>
            </div>
          )}

          <div className="cartao" style={{ padding: 0 }}>
            <div className="linha" style={{ padding: '12px 14px' }}>
              <strong>Produtos ({camp.itens.length})</strong><span className="espaco" />
              <button onClick={() => setColar(true)}>Colar lista</button>
              <button onClick={() => mudar((c) => ({ ...c, itens: [...c.itens, vazio()] }))}>+ Produto</button>
            </div>
            {sobrando > 0 && <div className="aviso" style={{ margin: '0 14px 10px' }}>A grade de {capacidade} mostra os {capacidade} primeiros; {sobrando} ficam de fora. Escolha uma grade maior.</div>}
            {camp.itens.length === 0 && <div className="vazio">Cole a lista de ofertas da semana ou adicione produto por produto.</div>}
            {camp.itens.length > 0 && (
              <table className="tabela-itens">
                <thead><tr><th style={{ width: 46 }}>Foto</th><th>Produto</th><th style={{ width: 92 }}>Preço</th><th style={{ width: 70 }}>Fator</th><th style={{ width: 30 }}></th></tr></thead>
                <tbody>{camp.itens.map((it, i) => (
                  <tr key={i} className={i >= capacidade ? 'fora-da-grade' : ''}>
                    <td><button className="miniatura-botao" onClick={() => setFoto(i)} title="Escolher foto" aria-label={'Foto de ' + (it.nome || 'produto')}>
                      {it.foto_id ? <img src={urlArquivo(it.foto_id)} alt="" /> : <span>+</span>}</button></td>
                    <td>
                      <input aria-label="Nome" value={it.nome} placeholder="Nome do produto" onChange={(e) => mudarItem(i, 'nome', e.target.value)} />
                      <input aria-label="Descrição" value={it.descricao} placeholder="Descrição (ex.: 5KG)" onChange={(e) => mudarItem(i, 'descricao', e.target.value)} className="sec" />
                      {it.candidatos && it.candidatos.length > 0 && !it.foto_id && (
                        <div className="sugestoes">Foto: {it.candidatos.map((c) => <button key={c.id} className="discreto" onClick={() => confirmarCandidato(i, c)}>{c.nome}?</button>)}</div>)}
                    </td>
                    <td><input aria-label="Preço" value={it.preco} placeholder="0,00" inputMode="decimal" onChange={(e) => mudarItem(i, 'preco', e.target.value)} /></td>
                    <td><input aria-label="Fator" value={it.fator} onChange={(e) => mudarItem(i, 'fator', e.target.value.toUpperCase())} /></td>
                    <td><button className="discreto perigo" aria-label="Remover" onClick={() => mudar((c) => ({ ...c, itens: c.itens.filter((_, j) => j !== i) }))}>×</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>

        <div className="previa">
          <canvas ref={tela} width={540} height={960} aria-label="Prévia do encarte" />
        </div>
      </div>

      {colar && <ColarLista aoFechar={() => setColar(false)} aoAplicar={aplicarLista} temItens={camp.itens.length > 0} />}
      {foto !== null && <EscolherFoto nome={camp.itens[foto].nome} aoFechar={() => setFoto(null)}
        aoEscolher={(a) => { mudar((c) => ({ ...c, itens: c.itens.map((x, j) => j === foto ? { ...x, foto_id: a ? a.id : null, candidatos: undefined } : x) })); setFoto(null); }} />}
    </>
  );
}

function ColarLista({ aoFechar, aoAplicar, temItens }: { aoFechar: () => void; aoAplicar: (t: string, substituir: boolean) => void; temItens: boolean }) {
  const [texto, setTexto] = useState('');
  const n = lerLista(texto).length;
  return (
    <Modal titulo="Colar lista de ofertas" aoFechar={aoFechar} acoes={<>
      <button onClick={aoFechar}>Cancelar</button>
      {temItens && <button disabled={!n} onClick={() => aoAplicar(texto, false)}>Adicionar ao fim</button>}
      <button className="primario" disabled={!n} onClick={() => aoAplicar(texto, true)}>{temItens ? 'Substituir lista' : 'Usar lista'} ({n})</button>
    </>}>
      <p className="sub">Uma linha por produto. Vale colar do Excel (nome, descrição, preço, fator em colunas) ou escrever direto.</p>
      <textarea rows={9} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus
        placeholder={'ARROZ TIPO 1 5KG 24,90\nFEIJÃO CARIOCA 1KG 7,49 UN\nREFRIGERANTE 2L 7894900027013 9,99'} />
      <p className="sub" style={{ marginTop: 8 }}>As fotos vêm do banco pelo EAN ou pelo nome. O que ele não reconhecer, você escolhe na lista.</p>
    </Modal>
  );
}

function EscolherFoto({ nome, aoFechar, aoEscolher }: { nome: string; aoFechar: () => void; aoEscolher: (a: Asset | null) => void }) {
  const [busca, setBusca] = useState(nome.split(' ')[0] || '');
  const [fotos, setFotos] = useState<Asset[] | null>(null);
  useEffect(() => {
    const t = setTimeout(async () => setFotos((await api.get<{ assets: Asset[] }>('/assets?tipo=produto&q=' + encodeURIComponent(busca))).assets), 200);
    return () => clearTimeout(t);
  }, [busca]);
  return (
    <Modal titulo={'Foto: ' + (nome || 'produto')} aoFechar={aoFechar} acoes={<button onClick={() => aoEscolher(null)}>Sem foto</button>}>
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no banco de imagens…" autoFocus />
      <div className="galeria" style={{ marginTop: 12, maxHeight: 360, overflow: 'auto', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
        {fotos?.map((a) => (
          <button key={a.id} className="miniatura" style={{ padding: 0 }} onClick={() => aoEscolher(a)} title={a.nome}>
            <div className="imagem"><img src={urlArquivo(a.id)} alt={a.nome} /></div><div className="info"><strong>{a.nome}</strong></div>
          </button>))}
        {fotos?.length === 0 && <p className="sub">Nada com esse nome. Envie a foto em Banco de imagens.</p>}
      </div>
    </Modal>
  );
}
