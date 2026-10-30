// Configuração inicial: cria o primeiro super admin.
// Só funciona uma vez, e só com o token de configuração (o secret
// SETUP_TOKEN do Worker). Depois disso a API recusa para sempre.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ErroApi } from '../api';
import { Aviso } from '../componentes/Modal';

export function Configurar() {
  const [f, setF] = useState({ token: '', nome: '', email: '', senha: '', confirma: '' });
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function enviar(e: FormEvent) {
    e.preventDefault(); setErro('');
    if (f.senha !== f.confirma) return setErro('As duas senhas não são iguais.');
    try { await api.post('/setup', { token: f.token.trim(), nome: f.nome, email: f.email, senha: f.senha }); setFeito(true); }
    catch (x) { setErro(x instanceof ErroApi ? x.message : 'Falhou.'); }
  }

  return (
    <div className="tela-entrar">
      <form className="cartao" onSubmit={enviar}>
        <h1>Configuração inicial</h1>
        {feito ? (
          <>
            <Aviso tipo="ok">Super admin criado. Esta tela não funciona mais.</Aviso>
            <Link to="/entrar"><button type="button" className="primario">Entrar</button></Link>
          </>
        ) : (
          <>
            <p className="sub">Cria a conta de super admin da EncartaAi. Funciona uma única vez.</p>
            <Aviso>{erro}</Aviso>
            <label>Token de configuração<input value={f.token} onChange={set('token')} required autoComplete="off" /></label>
            <label>Seu nome<input value={f.nome} onChange={set('nome')} required /></label>
            <label>E-mail<input type="email" value={f.email} onChange={set('email')} required autoComplete="username" /></label>
            <label>Senha <span className="dica">12 caracteres ou mais — esta conta controla todos os clientes.</span>
              <input type="password" value={f.senha} onChange={set('senha')} required minLength={12} autoComplete="new-password" /></label>
            <label>Repita a senha<input type="password" value={f.confirma} onChange={set('confirma')} required autoComplete="new-password" /></label>
            <button className="primario" style={{ width: '100%', justifyContent: 'center' }}>Criar super admin</button>
          </>
        )}
      </form>
    </div>
  );
}
