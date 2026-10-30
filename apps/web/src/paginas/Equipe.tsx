import { useEffect, useState, type FormEvent } from 'react';
import { api, ErroApi } from '../api';
import { useSessao } from '../App';
import { Aviso, Modal } from '../componentes/Modal';

interface Usuario { id: string; email: string; nome: string; papel: string; ativo: number }
const PAPEIS: Record<string, string> = { dono: 'Dono — tudo, inclusive equipe e exclusões', editor: 'Editor — cria campanhas e envia imagens', operador: 'Operador — atualiza preços e exporta' };

export function Equipe() {
  const { eu } = useSessao();
  const [lista, setLista] = useState<Usuario[] | null>(null);
  const [novo, setNovo] = useState(false);
  const carregar = async () => setLista((await api.get<{ usuarios: Usuario[] }>('/usuarios')).usuarios);
  useEffect(() => { carregar(); }, []);
  const cheio = eu?.acessos ? eu.acessos.emUso >= eu.acessos.limite : false;

  return (
    <>
      <div className="cabecalho">
        <div><h1>Equipe</h1><p className="sub">{eu?.acessos ? `${eu.acessos.emUso} de ${eu.acessos.limite} acesso(s) em uso.` : ''} Cada acesso funciona em um computador por vez.</p></div>
        <button className="primario" onClick={() => setNovo(true)}>+ Adicionar pessoa</button>
      </div>
      {cheio && <Aviso tipo="alerta">Todos os acessos do plano estão em uso. Para adicionar alguém, contrate um acesso extra.</Aviso>}
      <div className="cartao" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th></tr></thead>
          <tbody>{lista?.map((u) => <tr key={u.id}><td>{u.nome}{u.id === eu?.usuario.id && ' (você)'}</td><td>{u.email}</td><td>{u.papel}</td></tr>)}</tbody>
        </table>
      </div>
      {novo && <NovaPessoa aoFechar={() => setNovo(false)} aoSalvar={async () => { setNovo(false); await carregar(); }} />}
    </>
  );
}

function NovaPessoa({ aoFechar, aoSalvar }: { aoFechar: () => void; aoSalvar: () => void }) {
  const { recarregar } = useSessao();
  const [f, setF] = useState({ nome: '', email: '', senha: '', papel: 'editor' });
  const [erro, setErro] = useState('');
  async function salvar(e: FormEvent) {
    e.preventDefault();
    try { await api.post('/usuarios', f); await recarregar(); aoSalvar(); }
    catch (x) { setErro(x instanceof ErroApi ? x.message : 'Falhou.'); }
  }
  return (
    <Modal titulo="Adicionar pessoa" aoFechar={aoFechar}>
      <form onSubmit={salvar}>
        <Aviso>{erro}</Aviso>
        <label>Nome<input value={f.nome} required onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
        <label>E-mail<input type="email" value={f.email} required onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Senha inicial<input value={f.senha} required minLength={8} autoComplete="off" onChange={(e) => setF({ ...f, senha: e.target.value })} /></label>
        <label>Papel<select value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value })}>
          {Object.entries(PAPEIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" onClick={aoFechar}>Cancelar</button><button className="primario">Adicionar</button></div>
      </form>
    </Modal>
  );
}
