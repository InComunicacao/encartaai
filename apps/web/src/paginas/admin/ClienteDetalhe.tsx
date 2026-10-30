import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ErroApi, fmtReais } from '../../api';
import { Aviso } from '../../componentes/Modal';
import { corStatus, type Catalogo } from './Clientes';

interface Detalhe {
  cliente: { id: string; nome: string; slug: string; plano_id: string; status: string; acessos_extras: number; acessos_inclusos: number };
  modulos: string[];
  excecoes: { modulo_id: string; ativo: number; motivo: string | null }[];
  usuarios: { id: string; email: string; nome: string; papel: string; ativo: number }[];
  acessos: { limite: number; emUso: number };
}

export function ClienteDetalhe() {
  const { id } = useParams();
  const [d, setD] = useState<Detalhe | null>(null);
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const carregar = async () => {
    const [x, c] = await Promise.all([api.get<Detalhe>('/admin/clientes/' + id), api.get<Catalogo>('/admin/catalogo')]);
    setD(x); setCat(c);
  };
  useEffect(() => { carregar(); }, [id]);

  async function salvar(corpo: object, texto: string) {
    try { await api.put('/admin/clientes/' + id, corpo); setMsg({ tipo: 'ok', texto }); await carregar(); }
    catch (x) { setMsg({ tipo: 'erro', texto: x instanceof ErroApi ? x.message : 'Falhou.' }); }
  }
  async function modulo(mid: string, valor: string) {
    const ativo = valor === 'plano' ? null : valor === 'liberado';
    try { await api.put(`/admin/clientes/${id}/modulos/${mid}`, { ativo }); await carregar(); }
    catch (x) { setMsg({ tipo: 'erro', texto: x instanceof ErroApi ? x.message : 'Falhou.' }); }
  }

  if (!d || !cat) return <p>Carregando…</p>;
  const plano = cat.planos.find((p) => p.id === d.cliente.plano_id)!;
  const exc = new Map(d.excecoes.map((e) => [e.modulo_id, e.ativo]));

  return (
    <>
      <p><Link to="/">← Clientes</Link></p>
      <div className="cabecalho">
        <div>
          <h1>{d.cliente.nome}</h1>
          <p className="sub">{d.cliente.slug}.encartaai.com.br · <span className={'etiqueta ' + corStatus(d.cliente.status)}>{d.cliente.status}</span></p>
        </div>
        {d.cliente.status === 'ativo'
          ? <button className="perigo" onClick={() => salvar({ status: 'suspenso' }, 'Cliente suspenso. Todos os acessos caíram.')}>Suspender</button>
          : <button className="primario" onClick={() => salvar({ status: 'ativo' }, 'Cliente reativado.')}>Reativar</button>}
      </div>
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}

      <div className="grade-2">
        <div className="cartao">
          <h2>Plano</h2>
          <label>Plano atual
            <select value={d.cliente.plano_id} onChange={(e) => salvar({ plano_id: e.target.value }, 'Plano alterado.')}>
              {cat.planos.map((p) => <option key={p.id} value={p.id}>{p.nome} — {fmtReais(p.preco_centavos)}/mês</option>)}
            </select>
          </label>
          <p className="sub" style={{ marginBottom: 0 }}>
            {plano.creditos_ia_mes ? `${plano.creditos_ia_mes} créditos de IA por mês. ` : ''}
            Mensalidade com acessos extras: <strong>{fmtReais(plano.preco_centavos + d.cliente.acessos_extras * (plano.preco_acesso_extra_centavos || 0))}</strong>
          </p>
        </div>
        <div className="cartao">
          <h2>Acessos</h2>
          <p>{d.acessos.emUso} em uso de {d.acessos.limite} ({d.cliente.acessos_inclusos} do plano + {d.cliente.acessos_extras} extra)</p>
          {plano.preco_acesso_extra_centavos ? (
            <div className="linha">
              <button onClick={() => salvar({ acessos_extras: d.cliente.acessos_extras + 1 }, 'Acesso extra adicionado.')}>+ Acesso extra ({fmtReais(plano.preco_acesso_extra_centavos)})</button>
              {d.cliente.acessos_extras > 0 && <button className="discreto" onClick={() => salvar({ acessos_extras: d.cliente.acessos_extras - 1 }, 'Acesso extra removido.')}>Remover um</button>}
            </div>
          ) : <p className="sub">O plano {plano.nome} não vende acesso extra.</p>}
        </div>
      </div>

      <div className="cartao">
        <h2>Módulos</h2>
        <p className="sub">O plano define o padrão. Libere um módulo como bônus ou teste, ou bloqueie um que o plano daria.</p>
        <div className="modulos">
          {cat.modulos.map((m) => {
            const noPlano = plano.modulos.includes(m.id);
            const valor = exc.has(m.id) ? (exc.get(m.id) ? 'liberado' : 'bloqueado') : 'plano';
            const ativo = d.modulos.includes(m.id);
            return (
              <div className="modulo" key={m.id}>
                <div className="linha">
                  <strong>{m.nome}</strong>
                  <span className={'etiqueta ' + (ativo ? 'verde' : '')}>{ativo ? 'ativo' : 'desligado'}</span>
                </div>
                <select aria-label={'Módulo ' + m.nome} value={valor} onChange={(e) => modulo(m.id, e.target.value)}>
                  <option value="plano">Padrão do plano ({noPlano ? 'incluso' : 'não incluso'})</option>
                  <option value="liberado">Liberar (bônus / teste)</option>
                  <option value="bloqueado">Bloquear</option>
                </select>
              </div>
            );
          })}
        </div>
      </div>

      <div className="cartao" style={{ padding: 0 }}>
        <div style={{ padding: '16px 20px 0' }}><h2>Usuários</h2></div>
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Status</th></tr></thead>
          <tbody>{d.usuarios.map((u) => (
            <tr key={u.id}><td>{u.nome}</td><td>{u.email}</td><td>{u.papel}</td>
              <td><span className={'etiqueta ' + (u.ativo ? 'verde' : '')}>{u.ativo ? 'ativo' : 'inativo'}</span></td></tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
