import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ErroApi, fmtReais } from '../../api';
import { Aviso, Modal } from '../../componentes/Modal';

export interface Plano { id: string; nome: string; preco_centavos: number; acessos_inclusos: number; preco_acesso_extra_centavos: number | null; creditos_ia_mes: number; modulos: string[] }
export interface Catalogo { planos: Plano[]; modulos: { id: string; nome: string; grupo: string }[] }
interface Linha { id: string; slug: string; nome: string; plano_id: string; status: string; acessos_extras: number; acessos_em_uso: number; criado_em: number }

export const corStatus = (s: string) => s === 'ativo' ? 'verde' : s === 'suspenso' ? 'laranja' : 'vermelha';

export function Clientes() {
  const [lista, setLista] = useState<Linha[] | null>(null);
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [novo, setNovo] = useState(false);
  const navegar = useNavigate();

  const carregar = async () => {
    const [l, c] = await Promise.all([api.get<{ clientes: Linha[] }>('/admin/clientes'), api.get<Catalogo>('/admin/catalogo')]);
    setLista(l.clientes); setCat(c);
  };
  useEffect(() => { carregar(); }, []);

  const receitaMes = lista && cat ? lista.filter((c) => c.status === 'ativo').reduce((s, c) => {
    const p = cat.planos.find((x) => x.id === c.plano_id);
    return s + (p ? p.preco_centavos + c.acessos_extras * (p.preco_acesso_extra_centavos || 0) : 0);
  }, 0) : 0;

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Clientes</h1>
          <p className="sub">{lista ? `${lista.filter((c) => c.status === 'ativo').length} ativos · receita mensal ${fmtReais(receitaMes)}` : 'Carregando…'}</p>
        </div>
        <button className="primario" onClick={() => setNovo(true)}>+ Novo cliente</button>
      </div>
      <div className="cartao" style={{ padding: 0 }}>
        {lista && lista.length === 0 && <div className="vazio">Nenhum cliente ainda. Comece pelo Terê Frutas.</div>}
        {lista && lista.length > 0 && (
          <table>
            <thead><tr><th>Cliente</th><th>Endereço</th><th>Plano</th><th>Acessos</th><th>Status</th></tr></thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} className="clicavel" onClick={() => navegar('/clientes/' + c.id)}>
                  <td><strong>{c.nome}</strong></td>
                  <td>{c.slug}.encartaai.com.br</td>
                  <td>{cat?.planos.find((p) => p.id === c.plano_id)?.nome || c.plano_id}</td>
                  <td>{c.acessos_em_uso}</td>
                  <td><span className={'etiqueta ' + corStatus(c.status)}>{c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {novo && cat && <NovoCliente cat={cat} aoFechar={() => setNovo(false)} aoCriar={(id) => navegar('/clientes/' + id)} />}
    </>
  );
}

function slugDe(nome: string) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function NovoCliente({ cat, aoFechar, aoCriar }: { cat: Catalogo; aoFechar: () => void; aoCriar: (id: string) => void }) {
  const [f, setF] = useState({ nome: '', slug: '', plano_id: 'completo', email: '', donoNome: '', senha: '' });
  const [slugManual, setSlugManual] = useState(false);
  const [erro, setErro] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function criar(e: FormEvent) {
    e.preventDefault(); setErro('');
    try {
      const r = await api.post<{ id: string }>('/admin/clientes', {
        nome: f.nome, slug: f.slug, plano_id: f.plano_id, dono: { email: f.email, nome: f.donoNome, senha: f.senha } });
      aoCriar(r.id);
    } catch (x) { setErro(x instanceof ErroApi ? x.message : 'Falhou.'); }
  }

  return (
    <Modal titulo="Novo cliente" aoFechar={aoFechar}>
      <form onSubmit={criar}>
        <Aviso>{erro}</Aviso>
        <label>Nome do cliente
          <input value={f.nome} required onChange={(e) => setF({ ...f, nome: e.target.value, slug: slugManual ? f.slug : slugDe(e.target.value) })} />
        </label>
        <label>Endereço <span className="dica">{(f.slug || 'cliente') + '.encartaai.com.br'}</span>
          <input value={f.slug} required pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" onChange={(e) => { setSlugManual(true); set('slug')(e); }} />
        </label>
        <label>Plano
          <select value={f.plano_id} onChange={set('plano_id')}>
            {cat.planos.map((p) => <option key={p.id} value={p.id}>{p.nome} — {fmtReais(p.preco_centavos)}/mês</option>)}
          </select>
        </label>
        <div className="grade-2">
          <label>Nome do dono<input value={f.donoNome} required onChange={set('donoNome')} /></label>
          <label>E-mail do dono<input type="email" value={f.email} required onChange={set('email')} /></label>
        </div>
        <label>Senha inicial <span className="dica">8 caracteres ou mais. Passe ao cliente por um canal seguro.</span>
          <input type="text" value={f.senha} required minLength={8} onChange={set('senha')} autoComplete="off" />
        </label>
        <div className="acoes" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={aoFechar}>Cancelar</button>
          <button className="primario">Criar cliente</button>
        </div>
      </form>
    </Modal>
  );
}
