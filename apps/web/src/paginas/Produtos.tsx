import { useEffect, useState, type FormEvent } from 'react';
import { api, ErroApi, urlArquivo, type Asset } from '../api';
import { useSessao } from '../App';
import { Aviso, Modal } from '../componentes/Modal';

interface Produto { id: string; ean: string | null; nome: string; descricao: string | null; categoria: string | null; foto_id: string | null }
interface Resultado { texto: string; status: 'ean' | 'apelido' | 'sugestao' | 'nenhum'; produto?: { id: string; nome: string; foto_id: string | null };
  candidatos?: { id: string; nome: string; foto_id: string | null; pontuacao: number }[] }

export function Produtos() {
  const { eu } = useSessao();
  const pode = eu?.usuario.papel === 'dono' || eu?.usuario.papel === 'editor';
  const [lista, setLista] = useState<Produto[] | null>(null);
  const [q, setQ] = useState('');
  const [novo, setNovo] = useState(false);
  const [foto, setFoto] = useState<Produto | null>(null);
  const [erro, setErro] = useState('');

  const carregar = async () => setLista((await api.get<{ produtos: Produto[] }>('/produtos?q=' + encodeURIComponent(q))).produtos);
  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [q]);

  async function apagar(p: Produto) {
    if (!confirm(`Apagar "${p.nome}"? As fotos continuam no banco.`)) return;
    try { await api.del('/produtos/' + p.id); await carregar(); } catch (x) { setErro(x instanceof ErroApi ? x.message : 'Falhou.'); }
  }

  return (
    <>
      <div className="cabecalho">
        <div><h1>Produtos</h1><p className="sub">O cadastro que liga cada produto à sua foto, pelo EAN ou pelo nome.</p></div>
        {pode && <button className="primario" onClick={() => setNovo(true)}>+ Novo produto</button>}
      </div>
      <Testador />
      <Aviso>{erro}</Aviso>
      <div className="cartao" style={{ padding: 0 }}>
        <div style={{ padding: 12 }}><input placeholder="Buscar por nome ou EAN…" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: 0 }} /></div>
        {lista && lista.length === 0 && <div className="vazio">Nenhum produto. Envie fotos com o EAN no nome para criar o cadastro automaticamente.</div>}
        {lista && lista.length > 0 && (
          <table>
            <thead><tr><th style={{ width: 64 }}>Foto</th><th>Produto</th><th>EAN</th><th></th></tr></thead>
            <tbody>{lista.map((p) => (
              <tr key={p.id}>
                <td>{p.foto_id ? <img src={urlArquivo(p.foto_id)} alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} /> : <span className="etiqueta laranja">sem foto</span>}</td>
                <td><strong>{p.nome}</strong>{p.descricao && <div className="sub" style={{ margin: 0 }}>{p.descricao}</div>}</td>
                <td>{p.ean || '—'}</td>
                <td style={{ textAlign: 'right' }}>{pode && <>
                  <button className="discreto" onClick={() => setFoto(p)}>{p.foto_id ? 'Trocar foto' : 'Escolher foto'}</button>
                  <button className="discreto perigo" onClick={() => apagar(p)}>Apagar</button></>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {novo && <NovoProduto aoFechar={() => setNovo(false)} aoSalvar={() => { setNovo(false); carregar(); }} />}
      {foto && <EscolherFoto produto={foto} aoFechar={() => setFoto(null)} aoSalvar={() => { setFoto(null); carregar(); }} />}
    </>
  );
}

function NovoProduto({ aoFechar, aoSalvar }: { aoFechar: () => void; aoSalvar: () => void }) {
  const [f, setF] = useState({ nome: '', ean: '', descricao: '' });
  const [erro, setErro] = useState('');
  async function salvar(e: FormEvent) {
    e.preventDefault();
    try { await api.post('/produtos', { nome: f.nome, ean: f.ean || undefined, descricao: f.descricao || undefined }); aoSalvar(); }
    catch (x) { setErro(x instanceof ErroApi ? x.message : 'Falhou.'); }
  }
  return (
    <Modal titulo="Novo produto" aoFechar={aoFechar}>
      <form onSubmit={salvar}>
        <Aviso>{erro}</Aviso>
        <label>Nome<input value={f.nome} required onChange={(e) => setF({ ...f, nome: e.target.value })} autoFocus /></label>
        <label>Descrição <span className="dica">Ex.: TIPO 1 5KG</span><input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></label>
        <label>EAN <span className="dica">O código de barras. Opcional, mas é o que faz a foto acertar sempre.</span>
          <input value={f.ean} inputMode="numeric" onChange={(e) => setF({ ...f, ean: e.target.value })} /></label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" onClick={aoFechar}>Cancelar</button><button className="primario">Salvar</button></div>
      </form>
    </Modal>
  );
}

function EscolherFoto({ produto, aoFechar, aoSalvar }: { produto: Produto; aoFechar: () => void; aoSalvar: () => void }) {
  const [fotos, setFotos] = useState<Asset[] | null>(null);
  const [busca, setBusca] = useState(produto.nome.split(' ')[0]);
  useEffect(() => {
    const t = setTimeout(async () => setFotos((await api.get<{ assets: Asset[] }>('/assets?tipo=produto&q=' + encodeURIComponent(busca))).assets), 200);
    return () => clearTimeout(t);
  }, [busca]);
  async function escolher(a: Asset) { await api.post(`/produtos/${produto.id}/imagens`, { asset_id: a.id, principal: true }); aoSalvar(); }
  return (
    <Modal titulo={'Foto de ' + produto.nome} aoFechar={aoFechar}>
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no banco…" />
      <div className="galeria" style={{ marginTop: 12, maxHeight: 360, overflow: 'auto', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
        {fotos?.map((a) => (
          <button key={a.id} className="miniatura" style={{ padding: 0 }} onClick={() => escolher(a)} title={a.nome}>
            <div className="imagem"><img src={urlArquivo(a.id)} alt={a.nome} /></div>
            <div className="info"><strong>{a.nome}</strong></div>
          </button>
        ))}
        {fotos && fotos.length === 0 && <p className="sub">Nenhuma foto com esse nome.</p>}
      </div>
    </Modal>
  );
}

// "Cole a lista da semana e veja o que o banco reconhece" — o mesmo motor
// que o encarte vai usar para pôr a foto certa em cada produto.
function Testador() {
  const [texto, setTexto] = useState('');
  const [res, setRes] = useState<Resultado[] | null>(null);
  const [aberto, setAberto] = useState(false);
  async function testar() {
    const itens = texto.split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 200).map((t) => {
      const ean = (t.match(/\b\d{8,14}\b/) || [])[0];
      return { texto: t.replace(/\b\d{8,14}\b/, '').trim(), ean };
    });
    setRes((await api.post<{ resultados: Resultado[] }>('/banco/sugerir', { itens })).resultados);
  }
  async function confirmar(r: Resultado, produtoId: string, nome: string) {
    await api.post('/banco/confirmar', { texto: r.texto, produto_id: produtoId });
    setRes((x) => x!.map((y) => y === r ? { ...y, status: 'apelido', produto: { id: produtoId, nome, foto_id: null } } : y));
  }
  if (!aberto) return <p><button onClick={() => setAberto(true)}>Testar uma lista de ofertas no banco</button></p>;
  const rotulo = { ean: ['verde', 'pelo EAN'], apelido: ['verde', 'já confirmado'], sugestao: ['laranja', 'confirme'], nenhum: ['vermelha', 'sem foto'] } as const;
  return (
    <div className="cartao">
      <h2>Testar uma lista</h2>
      <textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={'Um produto por linha. Ex.:\nARROZ TIO JOAO 5KG\nCOCA COLA 2L 7894900027013'} />
      <p style={{ marginTop: 8 }}><button className="primario" onClick={testar} disabled={!texto.trim()}>Testar</button></p>
      {res && <table><tbody>{res.map((r, i) => (
        <tr key={i}>
          <td>{r.texto}</td>
          <td><span className={'etiqueta ' + rotulo[r.status][0]}>{rotulo[r.status][1]}</span></td>
          <td>{r.produto?.nome}
            {r.status === 'sugestao' && r.candidatos!.map((c) => (
              <button key={c.id} className="discreto" onClick={() => confirmar(r, c.id, c.nome)}>É "{c.nome}"? ({Math.round(c.pontuacao * 100)}%)</button>))}
          </td>
        </tr>))}</tbody></table>}
    </div>
  );
}
