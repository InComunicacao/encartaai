// Camadas: a logo da loja e as imagens soltas (selos, personagens, artes,
// fotos extras de produto). A lista mostra de cima (frente) para baixo.
import { useEffect, useState } from 'react';
import { api, ErroApi, urlArquivo, type Asset } from '../api';
import { Aviso, Modal } from './Modal';

export interface CamadaApi { id: string; asset_id: string; x: number; y: number; w: number; rot: number; atras: boolean; oculto: boolean; ancora: number | null }
export interface LogoApi { escala: number; dx: number; dy: number }

export const novaCamada = (asset_id: string, d: Partial<CamadaApi> = {}): CamadaApi =>
  ({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), asset_id, x: 0.5, y: 0.45, w: 0.25, rot: 0, atras: false, oculto: false, ancora: null, ...d });

interface Props {
  camadas: CamadaApi[];
  logo: LogoApi | null;
  temLogo: boolean;
  nomes: Record<string, string>;
  nomeProduto: (i: number) => string;
  selecionada: string | null;
  aoSelecionar: (id: string | null) => void;
  aoMudar: (c: CamadaApi[]) => void;
  aoLogo: (l: LogoApi | null) => void;
  aoAdicionar: () => void;
}

export function PainelCamadas({ camadas, logo, temLogo, nomes, nomeProduto, selecionada, aoSelecionar, aoMudar, aoLogo, aoAdicionar }: Props) {
  const l = logo || { escala: 1, dx: 0, dy: 0 };
  const ml = (d: Partial<LogoApi>) => aoLogo({ ...l, ...d });
  const mc = (id: string, d: Partial<CamadaApi>) => aoMudar(camadas.map((c) => c.id === id ? { ...c, ...d } : c));
  // a lista é exibida invertida (frente em cima); "subir" = mais para o fim do array
  const nivel = (id: string, d: number) => {
    const i = camadas.findIndex((c) => c.id === id), j = i + d;
    if (j < 0 || j >= camadas.length) return;
    const n = [...camadas]; [n[i], n[j]] = [n[j], n[i]]; aoMudar(n);
  };
  const sel = camadas.find((c) => c.id === selecionada);
  return (
    <div className="cartao painel-camadas">
      {temLogo && (
        <div className="bloco-logo">
          <strong>Logo da loja</strong>
          <div className="linha">
            <button aria-label="Diminuir logo" onClick={() => ml({ escala: Math.max(0.3, +(l.escala - 0.1).toFixed(2)) })}>−</button>
            <span className="valor">{Math.round(l.escala * 100)}%</span>
            <button aria-label="Aumentar logo" onClick={() => ml({ escala: Math.min(3, +(l.escala + 0.1).toFixed(2)) })}>+</button>
            <button aria-label="Logo para a esquerda" onClick={() => ml({ dx: +(l.dx - 0.01).toFixed(3) })}>←</button>
            <button aria-label="Logo para cima" onClick={() => ml({ dy: +(l.dy - 0.01).toFixed(3) })}>↑</button>
            <button aria-label="Logo para baixo" onClick={() => ml({ dy: +(l.dy + 0.01).toFixed(3) })}>↓</button>
            <button aria-label="Logo para a direita" onClick={() => ml({ dx: +(l.dx + 0.01).toFixed(3) })}>→</button>
            {logo && <button className="discreto" onClick={() => aoLogo(null)}>Restaurar</button>}
          </div>
        </div>
      )}
      <div className="linha" style={{ margin: '12px 0 8px' }}>
        <strong>Imagens soltas ({camadas.length})</strong><span className="espaco" />
        <button className="primario" onClick={aoAdicionar} disabled={camadas.length >= 40}>+ Imagem solta</button>
      </div>
      {camadas.length === 0 && <p className="sub">Selos, personagens, artes ou uma segunda foto de produto. Depois de adicionar, arraste direto no encarte.</p>}
      <ul className="lista-camadas">
        {[...camadas].reverse().map((c) => {
          const i = camadas.indexOf(c);
          return (
            <li key={c.id} className={(c.id === selecionada ? 'selecionada ' : '') + (c.oculto ? 'oculta' : '')} onClick={() => aoSelecionar(c.id)}>
              <img src={urlArquivo(c.asset_id)} alt="" />
              <span className="nome">{nomes[c.asset_id] || 'Imagem'}<small>{c.ancora != null ? 'no produto ' + (c.ancora + 1) + ' · ' + nomeProduto(c.ancora) : c.atras ? 'atrás dos produtos' : 'frente de tudo'}</small></span>
              <span className="acoes" onClick={(e) => e.stopPropagation()}>
                <button className="discreto" title="Subir 1 nível" aria-label="Subir 1 nível" disabled={i === camadas.length - 1} onClick={() => nivel(c.id, 1)}>↑</button>
                <button className="discreto" title="Descer 1 nível" aria-label="Descer 1 nível" disabled={i === 0} onClick={() => nivel(c.id, -1)}>↓</button>
                <button className="discreto" title={c.oculto ? 'Mostrar' : 'Ocultar'} aria-label={c.oculto ? 'Mostrar camada' : 'Ocultar camada'} onClick={() => mc(c.id, { oculto: !c.oculto })}>{c.oculto ? '🚫' : '👁'}</button>
                <button className="discreto" title="Duplicar" aria-label="Duplicar camada" onClick={() => aoMudar([...camadas, { ...c, id: novaCamada(c.asset_id).id, x: c.x + 0.04, y: c.y + 0.03 }])}>⧉</button>
                <button className="discreto perigo" title="Apagar" aria-label="Apagar camada" onClick={() => { aoMudar(camadas.filter((x) => x.id !== c.id)); aoSelecionar(null); }}>×</button>
              </span>
            </li>
          );
        })}
      </ul>
      {sel && (
        <div className="ajuste-camada">
          <div className="linha">
            <span>Tamanho</span>
            <button aria-label="Diminuir imagem" onClick={() => mc(sel.id, { w: Math.max(0.01, +(sel.w * 0.9).toFixed(4)) })}>−</button>
            <button aria-label="Aumentar imagem" onClick={() => mc(sel.id, { w: Math.min(3, +(sel.w * 1.1).toFixed(4)) })}>+</button>
            <span>Girar</span>
            <button aria-label="Girar à esquerda" onClick={() => mc(sel.id, { rot: ((sel.rot - 15 + 540) % 360) - 180 })}>⟲</button>
            <span className="valor">{Math.round(sel.rot)}°</span>
            <button aria-label="Girar à direita" onClick={() => mc(sel.id, { rot: ((sel.rot + 15 + 540) % 360) - 180 })}>⟳</button>
          </div>
          <div className="linha" style={{ marginTop: 6 }}>
            <label className="linha"><input type="radio" checked={!sel.atras} onChange={() => mc(sel.id, { atras: false })} style={{ width: 'auto', margin: 0 }} /> Frente de tudo</label>
            <label className="linha"><input type="radio" checked={sel.atras} onChange={() => mc(sel.id, { atras: true })} style={{ width: 'auto', margin: 0 }} /> Atrás dos produtos</label>
          </div>
          <p className="sub" style={{ margin: '6px 0 0' }}>Arraste no encarte para mover; use os cantos para aumentar e a bolinha de cima para girar. Delete apaga, setas movem.</p>
        </div>
      )}
    </div>
  );
}

// Escolher uma imagem do banco (qualquer tipo) ou enviar do computador.
const TIPOS = [['selo', 'Selos'], ['personagem', 'Personagens'], ['produto', 'Produtos'], ['tema', 'Temas'], ['fundo', 'Fundos'], ['logo', 'Logos']] as const;
export function EscolherImagem({ titulo, tipoInicial = 'selo', aoFechar, aoEscolher }: { titulo: string; tipoInicial?: string; aoFechar: () => void; aoEscolher: (a: Asset) => void }) {
  const [tipo, setTipo] = useState(tipoInicial);
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<Asset[] | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    setLista(null);
    const t = setTimeout(async () => setLista((await api.get<{ assets: Asset[] }>(`/assets?tipo=${tipo}&q=${encodeURIComponent(busca)}`)).assets), 150);
    return () => clearTimeout(t);
  }, [tipo, busca]);
  async function enviar(f?: File) {
    if (!f) return;
    setEnviando(true); setErro('');
    try { aoEscolher(await api.enviarArquivo<Asset>(`/assets/arquivo?tipo=${tipo}&nome=${encodeURIComponent(f.name.replace(/\.[a-z0-9]+$/i, ''))}`, f)); }
    catch (x) { setErro(x instanceof ErroApi ? x.message : 'Não foi possível enviar.'); }
    setEnviando(false);
  }
  return (
    <Modal titulo={titulo} aoFechar={aoFechar}>
      <Aviso>{erro}</Aviso>
      <div className="abas" role="tablist" style={{ marginBottom: 8 }}>
        {TIPOS.map(([id, nome]) => <button key={id} role="tab" aria-selected={tipo === id} className={tipo === id ? 'ativa' : ''} onClick={() => setTipo(id)}>{nome}</button>)}
      </div>
      <div className="linha">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" style={{ flex: 1, margin: 0 }} />
        <label className="botao primario" style={{ margin: 0 }}>{enviando ? 'Enviando…' : 'Enviar do computador'}
          <input type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label="Enviar imagem do computador" onChange={(e) => enviar(e.target.files?.[0])} /></label>
      </div>
      <div className="galeria" style={{ marginTop: 12, maxHeight: 340, overflow: 'auto', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
        {lista?.map((a) => (
          <button key={a.id} className="miniatura" style={{ padding: 0 }} onClick={() => aoEscolher(a)} title={a.nome}>
            <div className="imagem"><img src={urlArquivo(a.id)} alt={a.nome} /></div><div className="info"><strong>{a.nome}</strong></div>
          </button>))}
        {lista?.length === 0 && <p className="sub">Nada aqui. Envie do computador.</p>}
      </div>
    </Modal>
  );
}
