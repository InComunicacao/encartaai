import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api, quandoPerderSessao, type Eu } from './api';
import { Modal } from './componentes/Modal';
import { Entrar } from './paginas/Entrar';
import { Configurar } from './paginas/Configurar';
import { Clientes } from './paginas/admin/Clientes';
import { ClienteDetalhe } from './paginas/admin/ClienteDetalhe';
import { BancoGlobal } from './paginas/admin/BancoGlobal';
import { Inicio } from './paginas/Inicio';
import { Banco } from './paginas/Banco';
import { Produtos } from './paginas/Produtos';
import { Kit } from './paginas/Kit';
import { Equipe } from './paginas/Equipe';
import { Lojas } from './paginas/Lojas';
import { Campanhas } from './paginas/Campanhas';
import { Editor } from './paginas/Editor';

interface Sessao { eu: Eu | null; recarregar: () => Promise<void>; sair: () => Promise<void> }
const Ctx = createContext<Sessao>(null as any);
export const useSessao = () => useContext(Ctx);

// Os módulos que aparecem no menu. Os que estão fora do plano aparecem
// apagados com "no plano Completo" — vender começa por mostrar o que falta.
const MODULOS_MENU: { id: string; nome: string }[] = [
  { id: 'encarte', nome: 'Encarte' }, { id: 'video', nome: 'Vídeo e LED' }, { id: 'social', nome: 'Redes sociais' },
  { id: 'impressao', nome: 'Impressão' }, { id: 'ia', nome: 'IA' },
];

export function App() {
  const [eu, setEu] = useState<Eu | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [perdida, setPerdida] = useState<string | null>(null);
  const navegar = useNavigate();

  const recarregar = useCallback(async () => {
    try { setEu(await api.get<Eu>('/eu')); } catch { setEu(null); }
    setCarregando(false);
  }, []);
  useEffect(() => {
    quandoPerderSessao((_c, msg) => { setPerdida(msg); setEu(null); });
    recarregar();
  }, [recarregar]);

  const sair = async () => { await api.post('/auth/sair').catch(() => {}); setEu(null); navegar('/entrar'); };

  if (carregando) return null;
  return (
    <Ctx.Provider value={{ eu, recarregar, sair }}>
      {perdida && (
        <Modal titulo="Sessão encerrada" acoes={<button className="primario" onClick={() => { setPerdida(null); navegar('/entrar'); }}>Entrar de novo</button>}>
          <p>{perdida}</p>
          <p className="sub">Cada acesso funciona em um computador por vez.</p>
        </Modal>
      )}
      <Routes>
        <Route path="/entrar" element={eu ? <Navigate to="/" replace /> : <Entrar />} />
        <Route path="/configurar" element={<Configurar />} />
        <Route path="/*" element={eu ? <Casca /> : <Navigate to="/entrar" replace />} />
      </Routes>
    </Ctx.Provider>
  );
}

function Casca() {
  const { eu, sair } = useSessao();
  if (!eu) return null;
  const ehSuper = eu.usuario.papel === 'super';
  const dono = eu.usuario.papel === 'dono';
  return (
    <div className="casca">
      <nav className="lateral" aria-label="Menu">
        <div className="logo">Encarta<b>Ai</b></div>
        {ehSuper ? (
          <>
            <div className="grupo">Plataforma</div>
            <NavLink to="/" end>Clientes</NavLink>
            <NavLink to="/banco-global">Banco global</NavLink>
          </>
        ) : (
          <>
            <NavLink to="/" end>Início</NavLink>
            <div className="grupo">Criar</div>
            {MODULOS_MENU.map((m) => eu.modulos.includes(m.id)
              ? <NavLink key={m.id} to={'/' + m.id}>{m.nome}</NavLink>
              : <NavLink key={m.id} to={'/' + m.id} className="bloqueado" title="Disponível em outro plano">{m.nome} <span>🔒</span></NavLink>)}
            <div className="grupo">Marca e banco</div>
            <NavLink to="/banco">Banco de imagens</NavLink>
            <NavLink to="/produtos">Produtos</NavLink>
            <NavLink to="/kit">Kit da marca</NavLink>
            <NavLink to="/lojas">Lojas</NavLink>
            {dono && <NavLink to="/equipe">Equipe</NavLink>}
          </>
        )}
        <div className="rodape-lateral">
          <div>{eu.usuario.nome}</div>
          {eu.cliente && <div>{eu.cliente.nome} · {eu.cliente.plano_nome}</div>}
          <button onClick={sair}>Sair</button>
        </div>
      </nav>
      <main className="principal">
        <Routes>
          {ehSuper ? (
            <>
              <Route index element={<Clientes />} />
              <Route path="clientes/:id" element={<ClienteDetalhe />} />
              <Route path="banco-global" element={<BancoGlobal />} />
            </>
          ) : (
            <>
              <Route index element={<Inicio />} />
              <Route path="banco" element={<Banco />} />
              <Route path="produtos" element={<Produtos />} />
              <Route path="kit" element={<Kit />} />
              <Route path="lojas" element={<Lojas />} />
              {dono && <Route path="equipe" element={<Equipe />} />}
              {eu.modulos.includes('encarte') && <>
                <Route path="encarte" element={<Campanhas />} />
                <Route path="encarte/:id" element={<Editor />} />
              </>}
              {MODULOS_MENU.filter((m) => m.id !== 'encarte' || !eu.modulos.includes('encarte')).map((m) =>
                <Route key={m.id} path={m.id} element={<EmBreve modulo={m} liberado={eu.modulos.includes(m.id)} />} />)}
            </>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function EmBreve({ modulo, liberado }: { modulo: { nome: string }; liberado: boolean }) {
  return (
    <>
      <h1>{modulo.nome}</h1>
      <div className="cartao vazio">
        {liberado
          ? <p>Este módulo chega na Fase 2 da EncartaAi 3.0. Enquanto isso, o gerador atual continua funcionando.</p>
          : <p>{modulo.nome} não faz parte do seu plano. Fale com a gente para liberar.</p>}
      </div>
    </>
  );
}
