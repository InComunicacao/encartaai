import { useState } from 'react';
import { Galeria } from '../../componentes/Galeria';

export function BancoGlobal() {
  const [restrito, setRestrito] = useState('');
  return (
    <>
      <h1>Banco global</h1>
      <p className="sub">O que você envia aqui aparece para todos os clientes. Para restringir a um módulo (como a Gotham ao plano Completo), escolha abaixo antes de enviar.</p>
      <label style={{ maxWidth: 360 }}>Restringir os próximos envios a
        <select value={restrito} onChange={(e) => setRestrito(e.target.value)}>
          <option value="">Todos os clientes</option>
          <option value="modulo:fonte_gotham">Quem tem a fonte Gotham (Completo)</option>
          <option value="modulo:ia">Quem tem IA</option>
          <option value="modulo:impressao">Quem tem Impressão</option>
        </select>
      </label>
      <Galeria prefixo="/admin/banco" podeEnviar podeApagar={() => true} etiquetasNoEnvio={restrito || undefined} />
    </>
  );
}
