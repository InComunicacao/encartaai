import { useSessao } from '../App';
import { Galeria } from '../componentes/Galeria';

export function Banco() {
  const { eu } = useSessao();
  const pode = eu?.usuario.papel === 'dono' || eu?.usuario.papel === 'editor';
  return (
    <>
      <h1>Banco de imagens</h1>
      <p className="sub">Fotos de produto, logos, temas, selos, personagens e fontes. Os itens marcados como "global" vêm do banco da EncartaAi.</p>
      <Galeria prefixo="" podeEnviar={pode} podeApagar={(a) => pode && !a.global} />
    </>
  );
}
