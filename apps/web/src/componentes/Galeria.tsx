// Galeria com envio por arrastar-e-soltar. Serve ao banco do cliente e ao
// banco global — muda só o prefixo da API e quem pode apagar o quê.
import { useEffect, useRef, useState } from 'react';
import { api, ErroApi, fmtBytes, type Asset } from '../api';
import { Aviso, Modal } from './Modal';

export const TIPOS = [
  { id: 'produto', nome: 'Produtos' }, { id: 'logo', nome: 'Logos' }, { id: 'tema', nome: 'Temas' },
  { id: 'fundo', nome: 'Fundos' }, { id: 'selo', nome: 'Selos' }, { id: 'personagem', nome: 'Personagens' },
  { id: 'fonte', nome: 'Fontes' },
];

interface Props {
  prefixo: '' | '/admin/banco';        // de onde listar/enviar
  podeApagar: (a: Asset) => boolean;
  podeEnviar: boolean;
  etiquetasNoEnvio?: string;           // ex.: 'modulo:fonte_gotham'
}

interface Envio { nome: string; estado: 'enviando' | 'ok' | 'erro'; msg?: string }

export function Galeria({ prefixo, podeApagar, podeEnviar, etiquetasNoEnvio }: Props) {
  const [tipo, setTipo] = useState('produto');
  const [itens, setItens] = useState<Asset[] | null>(null);
  const [busca, setBusca] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [apagar, setApagar] = useState<{ a: Asset; usos?: { onde: string; nome: string }[] } | null>(null);
  const [erro, setErro] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const carregar = async () => {
    const q = new URLSearchParams({ tipo, ...(busca && !prefixo ? { q: busca } : {}) });
    setItens((await api.get<{ assets: Asset[] }>(`${prefixo}/assets?${q}`)).assets);
  };
  useEffect(() => { carregar(); }, [tipo]);
  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [busca]);

  async function enviar(arquivos: FileList | File[]) {
    const lista = [...arquivos];
    setEnvios(lista.map((f) => ({ nome: f.name, estado: 'enviando' })));
    // Três por vez: rápido sem estourar o limite de conexões do navegador.
    let i = 0;
    const trabalhar = async () => {
      while (i < lista.length) {
        const k = i++, f = lista[k];
        const q = new URLSearchParams({ tipo, nome: f.name, ...(etiquetasNoEnvio ? { etiquetas: etiquetasNoEnvio } : {}) });
        try {
          await api.enviarArquivo(`${prefixo}/assets/arquivo?${q}`, f);
          setEnvios((e) => e.map((x, j) => j === k ? { ...x, estado: 'ok' } : x));
        } catch (x) {
          setEnvios((e) => e.map((y, j) => j === k ? { ...y, estado: 'erro', msg: x instanceof ErroApi ? x.message : 'falhou' } : y));
        }
      }
    };
    await Promise.all([trabalhar(), trabalhar(), trabalhar()]);
    await carregar();
  }

  async function confirmarApagar(forcar: boolean) {
    if (!apagar) return;
    try {
      await api.del(`${prefixo}/assets/${apagar.a.id}`, forcar ? { confirmar: true } : {});
      setApagar(null); await carregar();
    } catch (x) {
      if (x instanceof ErroApi && x.codigo === 'em_uso') setApagar({ ...apagar, usos: x.dados.usos });
      else { setErro(x instanceof ErroApi ? x.message : 'Falhou.'); setApagar(null); }
    }
  }

  const src = (a: Asset) => `/api${prefixo}/assets/${a.id}/arquivo`;
  const ok = envios.filter((e) => e.estado === 'ok').length;
  const falhas = envios.filter((e) => e.estado === 'erro');

  return (
    <>
      <div className="abas" role="tablist">
        {TIPOS.map((t) => <button key={t.id} role="tab" aria-selected={tipo === t.id} className={tipo === t.id ? 'ativa' : ''} onClick={() => setTipo(t.id)}>{t.nome}</button>)}
        <span className="espaco" />
        {!prefixo && <input placeholder="Buscar pelo nome…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ maxWidth: 240, margin: 0 }} />}
      </div>

      {podeEnviar && (
        <div className={'zona-envio' + (arrastando ? ' ativa' : '')}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); if (e.dataTransfer.files.length) enviar(e.dataTransfer.files); }}>
          <p><strong>Arraste {tipo === 'fonte' ? 'fontes' : 'imagens'} aqui</strong> ou <button className="discreto" style={{ color: 'var(--marca-escura)' }} onClick={() => input.current?.click()}>escolha no computador</button></p>
          <p style={{ margin: 0, fontSize: 12 }}>
            {tipo === 'fonte' ? 'WOFF2, WOFF, TTF ou OTF · até 5 MB' : 'PNG, JPG ou WebP · até 15 MB'}
            {tipo === 'produto' && !prefixo && ' · com o EAN no nome do arquivo, a foto se liga sozinha ao produto'}
          </p>
          <input ref={input} type="file" multiple hidden accept={tipo === 'fonte' ? '.woff2,.woff,.ttf,.otf' : 'image/png,image/jpeg,image/webp'}
            onChange={(e) => { if (e.target.files?.length) enviar(e.target.files); e.target.value = ''; }} />
          {envios.length > 0 && (
            <p style={{ margin: '10px 0 0' }}>
              {envios.some((e) => e.estado === 'enviando') ? `Enviando… ${ok} de ${envios.length}` : `${ok} de ${envios.length} enviado(s)`}
            </p>
          )}
        </div>
      )}
      {falhas.length > 0 && <Aviso>{falhas.map((f) => `${f.nome}: ${f.msg}`).join(' · ')}</Aviso>}
      <Aviso>{erro}</Aviso>

      {itens && itens.length === 0 && <div className="cartao vazio">Nada aqui ainda.</div>}
      <div className="galeria">
        {itens?.map((a) => (
          <div className="miniatura" key={a.id}>
            <div className="imagem">
              {a.tipo === 'fonte'
                ? <FonteAmostra a={a} src={src(a)} />
                : <img src={src(a)} alt={a.nome} loading="lazy" />}
            </div>
            <div className="info">
              <strong title={a.nome}>{a.nome}</strong>
              <div className="linha">
                <span>{a.largura ? `${a.largura}×${a.altura} · ` : ''}{fmtBytes(a.bytes)}</span>
                {a.global && !prefixo
                  ? <span className="etiqueta">global</span>
                  : podeApagar(a) && <button className="discreto perigo" aria-label={'Apagar ' + a.nome} onClick={() => setApagar({ a })}>Apagar</button>}
              </div>
              {a.etiquetas.length > 0 && <span style={{ color: 'var(--texto-2)' }}>{a.etiquetas.join(', ')}</span>}
            </div>
          </div>
        ))}
      </div>

      {apagar && (
        <Modal titulo={`Apagar "${apagar.a.nome}"?`} aoFechar={() => setApagar(null)} acoes={<>
          <button onClick={() => setApagar(null)}>Cancelar</button>
          <button className="perigo cheio" onClick={() => confirmarApagar(!!apagar.usos)}>{apagar.usos ? 'Apagar mesmo assim' : 'Apagar'}</button>
        </>}>
          {apagar.usos
            ? <><p>Este arquivo está em uso:</p><ul>{apagar.usos.map((u, i) => <li key={i}>{u.onde}: {u.nome}</li>)}</ul><p className="sub">Apagando, esses lugares ficam sem a imagem. Não dá para desfazer.</p></>
            : <p>A exclusão é definitiva.</p>}
        </Modal>
      )}
    </>
  );
}

// Fonte enviada: carrega o arquivo e mostra "Aa 123" nela.
function FonteAmostra({ a, src }: { a: Asset; src: string }) {
  const [familia, setFamilia] = useState<string | null>(null);
  useEffect(() => {
    const nome = 'ea-' + a.id;
    const f = new FontFace(nome, `url(${src})`);
    f.load().then((ff) => { document.fonts.add(ff); setFamilia(nome); }).catch(() => setFamilia(null));
  }, [a.id]);
  return <span className="fonte-amostra" style={{ fontFamily: familia ? `'${familia}'` : undefined }}>Aa 123</span>;
}
