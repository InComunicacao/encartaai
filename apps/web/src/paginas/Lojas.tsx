import { useEffect, useState, type FormEvent } from 'react';
import { api, ErroApi, urlArquivo, type Asset } from '../api';
import { useSessao } from '../App';
import { Aviso, Modal } from '../componentes/Modal';

interface Loja { id: string; nome: string; rodape_texto: string | null; logo_asset_id: string | null }

export function Lojas() {
  const { eu } = useSessao();
  const papel = eu?.usuario.papel;
  const edita = papel === 'dono' || papel === 'editor';
  const [lojas, setLojas] = useState<Loja[] | null>(null);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
  const [logoDe, setLogoDe] = useState<Loja | null>(null);
  const carregar = async () => setLojas((await api.get<{ lojas: Loja[] }>('/lojas')).lojas);
  useEffect(() => { carregar(); }, []);

  async function criar(e: FormEvent) {
    e.preventDefault(); setErro('');
    try { await api.post('/lojas', { nome }); setNome(''); await carregar(); } catch (x) { setErro(x instanceof ErroApi ? x.message : 'Falhou.'); }
  }
  async function apagar(l: Loja) {
    if (!confirm(`Apagar a loja "${l.nome}"?`)) return;
    try { await api.del('/lojas/' + l.id); await carregar(); } catch (x) { setErro(x instanceof ErroApi ? x.message : 'Falhou.'); }
  }
  async function definirLogo(l: Loja, a: Asset | null) {
    try { await api.put('/lojas/' + l.id, { logo_asset_id: a ? a.id : null }); setLogoDe(null); await carregar(); }
    catch (x) { setErro(x instanceof ErroApi ? x.message : 'Falhou.'); }
  }

  // Texto próprio da loja (endereço, telefone…), usado no rodapé com {loja_texto}.
  async function textoRodape(l: Loja) {
    const t = prompt(`Texto do rodapé da loja "${l.nome}" (endereço, telefone, horário). Deixe vazio para tirar.`, l.rodape_texto || '');
    if (t === null) return;
    try { await api.put('/lojas/' + l.id, { rodape_texto: t.trim() || null }); await carregar(); } catch (x) { setErro(x instanceof ErroApi ? x.message : 'Falhou.'); }
  }

  return (
    <>
      <h1>Lojas</h1>
      <p className="sub">Cada loja tem a sua logo, que entra no topo do encarte. A campanha escolhe para qual loja é.</p>
      <Aviso>{erro}</Aviso>
      {edita && (
        <form className="cartao linha" onSubmit={criar}>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da loja (ex.: Loja 1 - Rio de Janeiro)" required style={{ flex: 1, margin: 0 }} />
          <button className="primario">Adicionar</button>
        </form>
      )}
      <div className="cartao" style={{ padding: 0 }}>
        {lojas?.length === 0 && <div className="vazio">Nenhuma loja cadastrada.</div>}
        {lojas && lojas.length > 0 && <table><tbody>{lojas.map((l) => (
          <tr key={l.id}>
            <td style={{ width: 120 }}>
              {l.logo_asset_id ? <img src={urlArquivo(l.logo_asset_id)} alt={'Logo ' + l.nome} style={{ height: 44, maxWidth: 110, objectFit: 'contain' }} />
                : <span className="etiqueta laranja">sem logo</span>}
            </td>
            <td><strong>{l.nome}</strong>{l.rodape_texto && <div className="sub" style={{ margin: 0, fontSize: 12 }}>Rodapé: {l.rodape_texto}</div>}</td>
            <td style={{ textAlign: 'right' }}>
              {edita && <button className="discreto" onClick={() => textoRodape(l)}>Texto do rodapé</button>}
              {edita && <button className="discreto" onClick={() => setLogoDe(l)}>{l.logo_asset_id ? 'Trocar logo' : 'Escolher logo'}</button>}
              {papel === 'dono' && <button className="discreto perigo" onClick={() => apagar(l)}>Apagar</button>}
            </td>
          </tr>
        ))}</tbody></table>}
      </div>
      {logoDe && <EscolherLogo loja={logoDe} aoFechar={() => setLogoDe(null)} aoEscolher={(a) => definirLogo(logoDe, a)} />}
    </>
  );
}

function EscolherLogo({ loja, aoFechar, aoEscolher }: { loja: Loja; aoFechar: () => void; aoEscolher: (a: Asset | null) => void }) {
  const [logos, setLogos] = useState<Asset[] | null>(null);
  useEffect(() => { api.get<{ assets: Asset[] }>('/assets?tipo=logo&limite=500').then((r) => setLogos(r.assets)); }, []);
  return (
    <Modal titulo={'Logo de ' + loja.nome} aoFechar={aoFechar} acoes={loja.logo_asset_id ? <button onClick={() => aoEscolher(null)}>Tirar a logo</button> : undefined}>
      <div className="galeria" style={{ maxHeight: 380, overflow: 'auto', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
        {logos?.map((a) => (
          <button key={a.id} className="miniatura" style={{ padding: 0 }} onClick={() => aoEscolher(a)} title={a.nome}>
            <div className="imagem"><img src={urlArquivo(a.id)} alt={a.nome} /></div><div className="info"><strong>{a.nome}</strong></div>
          </button>))}
        {logos?.length === 0 && <p className="sub">Envie as logos em Banco de imagens → Logos.</p>}
      </div>
    </Modal>
  );
}
