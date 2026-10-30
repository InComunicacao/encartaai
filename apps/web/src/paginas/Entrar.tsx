import { useState, type FormEvent } from 'react';
import { api, ErroApi } from '../api';
import { useSessao } from '../App';
import { Aviso } from '../componentes/Modal';

export function Entrar() {
  const { recarregar } = useSessao();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(''); setEnviando(true);
    try { await api.post('/auth/entrar', { email, senha }); await recarregar(); }
    catch (x) { setErro(x instanceof ErroApi ? x.message : 'Sem conexão. Tente de novo.'); }
    finally { setEnviando(false); }
  }

  return (
    <div className="tela-entrar">
      <form className="cartao" onSubmit={enviar}>
        <h1 style={{ fontSize: 26 }}>Encarta<span style={{ color: 'var(--marca)' }}>Ai</span></h1>
        <p className="sub">Entre para criar encartes, vídeos e materiais de oferta.</p>
        <Aviso>{erro}</Aviso>
        <label>E-mail
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>Senha
          <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        <button className="primario" style={{ width: '100%', justifyContent: 'center' }} disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
