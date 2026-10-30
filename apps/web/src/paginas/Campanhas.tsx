import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ErroApi } from '../api';
import { useSessao } from '../App';
import { Aviso, Modal } from '../componentes/Modal';

interface Linha { id: string; nome: string; loja_nome: string | null; itens: number; atualizado_em: number; tema: { grade: string } }

export function Campanhas() {
  const { eu } = useSessao();
  const pode = eu?.usuario.papel === 'dono' || eu?.usuario.papel === 'editor';
  const [lista, setLista] = useState<Linha[] | null>(null);
  const [nova, setNova] = useState<{ duplicar?: Linha } | null>(null);
  const [erro, setErro] = useState('');
  const carregar = async () => setLista((await api.get<{ campanhas: Linha[] }>('/campanhas')).campanhas);
  useEffect(() => { carregar(); }, []);

  async function apagar(c: Linha) {
    if (!confirm(`Apagar a campanha "${c.nome}"? Não dá para desfazer.`)) return;
    try { await api.del('/campanhas/' + c.id); await carregar(); } catch (x) { setErro(x instanceof ErroApi ? x.message : 'Falhou.'); }
  }

  return (
    <>
      <div className="cabecalho">
        <div><h1>Encartes</h1><p className="sub">Cada campanha guarda os produtos e preços. O encarte, e depois o vídeo e a impressão, saem dela.</p></div>
        {pode && <button className="primario" onClick={() => setNova({})}>+ Nova campanha</button>}
      </div>
      <Aviso>{erro}</Aviso>
      <div className="cartao" style={{ padding: 0 }}>
        {lista?.length === 0 && <div className="vazio">Nenhuma campanha ainda.</div>}
        {lista && lista.length > 0 && (
          <table>
            <thead><tr><th>Campanha</th><th>Loja</th><th>Produtos</th><th>Atualizada</th><th></th></tr></thead>
            <tbody>{lista.map((c) => (
              <tr key={c.id}>
                <td><Link to={'/encarte/' + c.id}><strong>{c.nome}</strong></Link></td>
                <td>{c.loja_nome || '—'}</td>
                <td>{c.itens}</td>
                <td>{new Date(c.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td style={{ textAlign: 'right' }}>{pode && <>
                  <button className="discreto" onClick={() => setNova({ duplicar: c })}>Duplicar</button>
                  <button className="discreto perigo" onClick={() => apagar(c)}>Apagar</button></>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {nova && <NovaCampanha duplicar={nova.duplicar} aoFechar={() => setNova(null)} />}
    </>
  );
}

function NovaCampanha({ duplicar, aoFechar }: { duplicar?: Linha; aoFechar: () => void }) {
  const [nome, setNome] = useState(duplicar ? duplicar.nome + ' (cópia)' : '');
  const [erro, setErro] = useState('');
  const navegar = useNavigate();
  async function criar(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await api.post<{ id: string }>('/campanhas', { nome, ...(duplicar ? { duplicar_de: duplicar.id } : {}) });
      navegar('/encarte/' + r.id);
    } catch (x) { setErro(x instanceof ErroApi ? x.message : 'Falhou.'); }
  }
  return (
    <Modal titulo={duplicar ? 'Duplicar campanha' : 'Nova campanha'} aoFechar={aoFechar}>
      <form onSubmit={criar}>
        <Aviso>{erro}</Aviso>
        <label>Nome <span className="dica">Ex.: Ofertas de fim de semana</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus /></label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={aoFechar}>Cancelar</button><button className="primario">{duplicar ? 'Duplicar' : 'Criar'}</button>
        </div>
      </form>
    </Modal>
  );
}
