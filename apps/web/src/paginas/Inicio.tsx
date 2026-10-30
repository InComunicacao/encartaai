import { Link } from 'react-router-dom';
import { useSessao } from '../App';

export function Inicio() {
  const { eu } = useSessao();
  if (!eu?.cliente) return null;
  const passos = [
    { feito: false, texto: 'Monte o kit da marca: fontes, cores e o texto do rodapé', link: '/kit' },
    { feito: false, texto: 'Cadastre as lojas, cada uma com a sua logo', link: '/lojas' },
    { feito: false, texto: 'Envie as fotos de produto — com o EAN no nome do arquivo, elas se ligam sozinhas', link: '/banco' },
  ];
  return (
    <>
      <h1>Olá, {eu.usuario.nome.split(' ')[0]}</h1>
      <p className="sub">{eu.cliente.nome} · plano {eu.cliente.plano_nome}{eu.acessos ? ` · ${eu.acessos.emUso} de ${eu.acessos.limite} acesso(s) em uso` : ''}</p>
      <div className="cartao">
        <h2>Para começar</h2>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
          {passos.map((p) => <li key={p.link}><Link to={p.link}>{p.texto}</Link></li>)}
        </ol>
      </div>
      <div className="cartao">
        <h2>Seu plano inclui</h2>
        <div className="linha">{eu.modulos.map((m) => <span key={m} className="etiqueta verde">{m.replace('bonus_', 'bônus: ').replace('_', ' ')}</span>)}</div>
      </div>
    </>
  );
}
