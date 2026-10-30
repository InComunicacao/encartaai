import { useEffect, useState, type FormEvent } from 'react';
import { api, ErroApi } from '../api';
import { useSessao } from '../App';
import { Aviso } from '../componentes/Modal';

interface Loja { id: string; nome: string; rodape_texto: string | null }

export function Lojas() {
  const { eu } = useSessao();
  const papel = eu?.usuario.papel;
  const [lojas, setLojas] = useState<Loja[] | null>(null);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
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

  return (
    <>
      <h1>Lojas</h1>
      <p className="sub">Cada loja pode ter a sua logo e o seu rodapé. A campanha escolhe para qual loja é.</p>
      <Aviso>{erro}</Aviso>
      {(papel === 'dono' || papel === 'editor') && (
        <form className="cartao linha" onSubmit={criar}>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da loja (ex.: Loja 1 - Rio de Janeiro)" required style={{ flex: 1, margin: 0 }} />
          <button className="primario">Adicionar</button>
        </form>
      )}
      <div className="cartao" style={{ padding: 0 }}>
        {lojas?.length === 0 && <div className="vazio">Nenhuma loja cadastrada.</div>}
        {lojas && lojas.length > 0 && <table><tbody>{lojas.map((l) => (
          <tr key={l.id}><td><strong>{l.nome}</strong></td>
            <td style={{ textAlign: 'right' }}>{papel === 'dono' && <button className="discreto perigo" onClick={() => apagar(l)}>Apagar</button>}</td></tr>
        ))}</tbody></table>}
      </div>
    </>
  );
}
