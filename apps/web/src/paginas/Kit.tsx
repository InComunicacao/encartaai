import { useEffect, useState } from 'react';
import { api, ErroApi, urlArquivo, type Asset } from '../api';
import { useSessao } from '../App';
import { Aviso } from '../componentes/Modal';

type Fonte = { origem: 'google' | 'arquivo'; familia: string; asset_id?: string; peso?: number };
interface KitDados {
  fontes: Record<string, Fonte | undefined>;
  cores: Record<string, string | undefined>;
  textos: Record<string, string | undefined>;
}
const PAPEIS_FONTE = [['nome', 'Nome do produto'], ['descricao', 'Descrição'], ['preco', 'Preço'], ['rodape', 'Rodapé'], ['titulo', 'Títulos']] as const;
const PAPEIS_COR = [['caixa_preco', 'Caixa do preço'], ['texto_preco', 'Texto do preço'], ['caixa_descricao', 'Caixa da descrição'],
  ['texto_descricao', 'Texto da descrição'], ['primaria', 'Cor principal'], ['secundaria', 'Cor secundária'], ['fundo', 'Fundo'], ['rodape', 'Rodapé']] as const;
const PADRAO: Record<string, string> = { caixa_preco: '#e40010', texto_preco: '#ffffff', caixa_descricao: '#ffffff', texto_descricao: '#1b1f24',
  primaria: '#e40010', secundaria: '#a25742', fundo: '#ffffff', rodape: '#0057b8' };

// Carrega uma família do Google Fonts sob demanda, para a prévia.
const carregadas = new Set<string>();
function carregarGoogle(familia: string) {
  if (!familia || carregadas.has(familia)) return;
  carregadas.add(familia);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(familia).replace(/%20/g, '+')}:wght@400;600;700;900&display=swap`;
  document.head.appendChild(l);
}
function carregarArquivo(id: string) {
  const nome = 'ea-' + id;
  if (carregadas.has(nome)) return nome;
  carregadas.add(nome);
  new FontFace(nome, `url(${urlArquivo(id)})`).load().then((f) => document.fonts.add(f)).catch(() => {});
  return nome;
}
const cssFamilia = (f?: Fonte) => !f ? undefined : f.origem === 'arquivo' && f.asset_id ? `'${carregarArquivo(f.asset_id)}'` : (carregarGoogle(f.familia), `'${f.familia}'`);

export function Kit() {
  const { eu } = useSessao();
  const pode = eu?.usuario.papel === 'dono' || eu?.usuario.papel === 'editor';
  const [kit, setKit] = useState<KitDados>({ fontes: {}, cores: {}, textos: {} });
  const [sugeridas, setSugeridas] = useState<string[]>([]);
  const [arquivos, setArquivos] = useState<Asset[]>([]);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  useEffect(() => {
    api.get<{ kit: Partial<KitDados>; fontes_sugeridas: string[] }>('/kit').then((r) => {
      setKit({ fontes: r.kit.fontes || {}, cores: r.kit.cores || {}, textos: r.kit.textos || {} });
      setSugeridas(r.fontes_sugeridas);
    });
    api.get<{ assets: Asset[] }>('/assets?tipo=fonte').then((r) => setArquivos(r.assets));
  }, []);

  const setFonte = (papel: string, f: Fonte | undefined) => setKit({ ...kit, fontes: { ...kit.fontes, [papel]: f } });
  async function salvar() {
    try {
      const limpo = { ...kit, fontes: Object.fromEntries(Object.entries(kit.fontes).filter(([, f]) => f && f.familia)) };
      await api.put('/kit', limpo); setMsg({ tipo: 'ok', texto: 'Kit da marca salvo. As próximas campanhas já nascem com ele.' });
    } catch (x) { setMsg({ tipo: 'erro', texto: x instanceof ErroApi ? x.message : 'Falhou.' }); }
  }
  const cor = (k: string) => kit.cores[k] || PADRAO[k];

  return (
    <>
      <div className="cabecalho">
        <div><h1>Kit da marca</h1><p className="sub">O ponto de partida de todo material. Cada campanha pode mudar o que quiser depois.</p></div>
        {pode && <button className="primario" onClick={salvar}>Salvar kit</button>}
      </div>
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}

      <div className="cartao">
        <h2>Prévia</h2>
        <div className="previa-caixa">
          <div className="desc" style={{ background: cor('caixa_descricao'), color: cor('texto_descricao') }}>
            <div style={{ fontFamily: cssFamilia(kit.fontes.nome), fontSize: 24, fontWeight: kit.fontes.nome?.peso || 700 }}>ARROZ TIO JOÃO</div>
            <div style={{ fontFamily: cssFamilia(kit.fontes.descricao), fontSize: 15 }}>TIPO 1 · 5KG</div>
          </div>
          <div className="preco" style={{ background: cor('caixa_preco'), color: cor('texto_preco'), fontFamily: cssFamilia(kit.fontes.preco), fontWeight: kit.fontes.preco?.peso || 900 }}>
            24<span style={{ fontSize: 22, alignSelf: 'flex-start', marginTop: 4 }}>,90</span>
          </div>
        </div>
        {kit.textos.rodape && <p className="sub" style={{ marginTop: 12, fontFamily: cssFamilia(kit.fontes.rodape) }}>{kit.textos.rodape}</p>}
      </div>

      <div className="cartao">
        <h2>Fontes</h2>
        <div className="grade-2">
          {PAPEIS_FONTE.map(([papel, rotulo]) => {
            const f = kit.fontes[papel];
            const valor = !f ? '' : f.origem === 'arquivo' ? 'arquivo:' + f.asset_id : 'google:' + f.familia;
            return (
              <label key={papel}>{rotulo}
                <select disabled={!pode} value={valor} onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return setFonte(papel, undefined);
                  if (v.startsWith('arquivo:')) { const a = arquivos.find((x) => x.id === v.slice(8))!; return setFonte(papel, { origem: 'arquivo', familia: a.nome.replace(/[^A-Za-z0-9 ]/g, ' ').trim().slice(0, 60) || 'Fonte', asset_id: a.id }); }
                  if (v === 'google:*') { const n = prompt('Nome exato da família no Google Fonts (ex.: Bebas Neue):'); if (n) setFonte(papel, { origem: 'google', familia: n.trim() }); return; }
                  setFonte(papel, { origem: 'google', familia: v.slice(7) });
                }}>
                  <option value="">Padrão</option>
                  {arquivos.length > 0 && <optgroup label="Suas fontes e as do seu plano">{arquivos.map((a) => <option key={a.id} value={'arquivo:' + a.id}>{a.nome}{a.global ? ' (EncartaAi)' : ''}</option>)}</optgroup>}
                  <optgroup label="Google Fonts (gratuitas)">
                    {sugeridas.map((s) => <option key={s} value={'google:' + s}>{s}</option>)}
                    {f?.origem === 'google' && !sugeridas.includes(f.familia) && <option value={'google:' + f.familia}>{f.familia}</option>}
                    <option value="google:*">Outra do Google Fonts…</option>
                  </optgroup>
                </select>
                {f && <div className="amostra-fonte" style={{ fontFamily: cssFamilia(f) }}>Oferta 24,90 Ágil</div>}
              </label>
            );
          })}
        </div>
      </div>

      <div className="cartao">
        <h2>Cores</h2>
        <div className="cores">
          {PAPEIS_COR.map(([k, rotulo]) => (
            <label key={k}><input type="color" disabled={!pode} value={cor(k)} onChange={(e) => setKit({ ...kit, cores: { ...kit.cores, [k]: e.target.value } })} />{rotulo}</label>
          ))}
        </div>
      </div>

      <div className="cartao">
        <h2>Textos padrão</h2>
        <label>Rodapé <span className="dica">Aparece em todo encarte. Use para a regra das ofertas e avisos legais.</span>
          <textarea rows={3} disabled={!pode} value={kit.textos.rodape || ''} onChange={(e) => setKit({ ...kit, textos: { ...kit.textos, rodape: e.target.value } })} />
        </label>
        <div className="grade-2">
          <label>Rótulo do preço no app<input disabled={!pode} placeholder="PREÇO NO APLICATIVO" value={kit.textos.rotulo_app || ''} onChange={(e) => setKit({ ...kit, textos: { ...kit.textos, rotulo_app: e.target.value } })} /></label>
          <label>Rótulo do preço fora do app<input disabled={!pode} placeholder="FORA DO APP" value={kit.textos.rotulo_fora_app || ''} onChange={(e) => setKit({ ...kit, textos: { ...kit.textos, rotulo_fora_app: e.target.value } })} /></label>
        </div>
      </div>
    </>
  );
}
