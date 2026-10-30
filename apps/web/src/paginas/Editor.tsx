// Editor de campanha: os produtos à esquerda, o encarte à direita,
// desenhado pelo MESMO motor que gera o PNG final — o que se vê é o que sai.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ENCARTE_VERTICAL, ESTILOS, GRADES, desenharEncarte, unitarioCombo, type Ctx2D, type PoliticaTexto } from '@encartaai/render';
import { api, ErroApi, urlArquivo, type Asset } from '../api';
import { useSessao } from '../App';
import { Aviso, Modal } from '../componentes/Modal';
import { carregarFonte, carregarImagem, itemDoMotor, kitDoCliente, lerLista, type ItemCampanha, type KitApi } from '../render-web';

interface ItemEd extends ItemCampanha { candidatos?: { id: string; nome: string; foto_id: string | null; pontuacao: number }[] }
interface Tema { grade: string; estilo: string; politica: PoliticaTexto; fundo_id: string | null }
interface Camp { id: string; nome: string; loja_id: string | null; tema: Tema; itens: ItemEd[]; atualizado_em: number }
interface Loja { id: string; nome: string; logo_asset_id: string | null }

const NOMES_GRADE: Record<string, string> = { '1': '1 produto', '4': '4 produtos (2×2)', '6': '6 produtos (2×3)', '8': '8 produtos (2×4)', '9': '9 produtos (3×3)', '12': '12 produtos (3×4)' };
const vazio = (): ItemEd => ({ nome: '', descricao: '', preco: '', fator: 'UN', foto_id: null, produto_id: null, selo_id: null, oculto: false,
  foto_ajuste: null, escala_nome: null, escala_preco: null, combo: null });

export function Editor() {
  const { id } = useParams();
  const { eu } = useSessao();
  const operador = eu?.usuario.papel === 'operador';
  const [camp, setCamp] = useState<Camp | null>(null);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [fundos, setFundos] = useState<Asset[]>([]);
  const [kitApi, setKitApi] = useState<KitApi>({});
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'salvando' | 'erro'; texto: string }>({ tipo: 'ok', texto: '' });
  const [colar, setColar] = useState(false);
  const [foto, setFoto] = useState<number | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [selos, setSelos] = useState<Asset[]>([]);
  const [erro, setErro] = useState('');
  const versao = useRef(0);
  const sujo = useRef(false);

  useEffect(() => {
    (async () => {
      const [c, l, f1, f2, k] = await Promise.all([
        api.get<{ campanha: Camp }>('/campanhas/' + id), api.get<{ lojas: Loja[] }>('/lojas'),
        api.get<{ assets: Asset[] }>('/assets?tipo=tema'), api.get<{ assets: Asset[] }>('/assets?tipo=fundo'), api.get<{ kit: KitApi }>('/kit')]);
      api.get<{ assets: Asset[] }>('/assets?tipo=selo').then((r) => setSelos(r.assets)).catch(() => {});
      versao.current = c.campanha.atualizado_em;
      setCamp({ ...c.campanha, itens: c.campanha.itens.map((i) => ({ ...vazio(), ...i })) });
      setLojas(l.lojas); setFundos([...f1.assets, ...f2.assets]); setKitApi(k.kit);
    })();
  }, [id]);

  // ── autosave ──
  const salvar = useCallback(async (c: Camp) => {
    setEstado({ tipo: 'salvando', texto: 'Salvando…' });
    try {
      const corpo: Record<string, unknown> = {
        itens: c.itens.map(({ candidatos, ...i }) => i), versao: versao.current,
        ...(operador ? {} : { nome: c.nome, tema: c.tema, loja_id: c.loja_id }),
      };
      const r = await api.put<{ versao: number }>('/campanhas/' + c.id, corpo);
      versao.current = r.versao; sujo.current = false;
      setEstado({ tipo: 'ok', texto: 'Salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) });
    } catch (x) {
      setEstado({ tipo: 'erro', texto: x instanceof ErroApi ? x.message : 'Sem conexão — as mudanças não foram salvas.' });
    }
  }, [operador]);
  useEffect(() => {
    if (!camp || !sujo.current) return;
    const t = setTimeout(() => salvar(camp), 1200);
    return () => clearTimeout(t);
  }, [camp, salvar]);
  const mudar = (f: (c: Camp) => Camp) => { sujo.current = true; setCamp((c) => c && f(c)); };
  const mudarItem = (i: number, campo: keyof ItemEd, v: unknown) => mudar((c) => ({ ...c, itens: c.itens.map((x, j) => j === i ? { ...x, [campo]: v } : x) }));
  const mudarTema = (t: Partial<Tema>) => mudar((c) => ({ ...c, tema: { ...c.tema, ...t } }));

  // ── colar lista ──
  async function aplicarLista(texto: string, substituir: boolean) {
    const linhas = lerLista(texto);
    const novos: ItemEd[] = linhas.map((l) => ({ ...vazio(), nome: l.nome, descricao: l.descricao, preco: l.preco, fator: l.fator || 'UN' }));
    try {
      const r = await api.post<{ resultados: any[] }>('/banco/sugerir', { itens: linhas.map((l) => ({ texto: [l.nome, l.descricao].join(' ').trim(), ean: l.ean })) });
      r.resultados.forEach((res, k) => {
        if (res.produto) { novos[k].produto_id = res.produto.id; novos[k].foto_id = res.produto.foto_id; }
        else if (res.candidatos) novos[k].candidatos = res.candidatos;
      });
    } catch { /* sem banco, segue sem fotos */ }
    mudar((c) => ({ ...c, itens: substituir ? novos : [...c.itens, ...novos] }));
    setColar(false);
  }
  async function confirmarCandidato(i: number, cand: NonNullable<ItemEd['candidatos']>[number]) {
    const item = camp!.itens[i];
    await api.post('/banco/confirmar', { texto: [item.nome, item.descricao].join(' ').trim(), produto_id: cand.id }).catch(() => {});
    mudar((c) => ({ ...c, itens: c.itens.map((x, j) => j === i ? { ...x, produto_id: cand.id, foto_id: cand.foto_id, candidatos: undefined } : x) }));
  }

  // ── desenho ──
  const tela = useRef<HTMLCanvasElement>(null);
  const desenhar = useCallback(async (canvas: HTMLCanvasElement, c: Camp, escala: number) => {
    const { kit, fontes } = kitDoCliente(kitApi);
    const grade = GRADES[c.tema.grade];
    const usados = c.itens.slice(0, grade.celulas.length);
    const logoId = lojas.find((l) => l.id === c.loja_id)?.logo_asset_id;
    const [fundo, logo, itens] = await Promise.all([carregarImagem(c.tema.fundo_id), carregarImagem(logoId),
      Promise.all(usados.map(itemDoMotor)), ...fontes.map(carregarFonte)]);
    const ctx = canvas.getContext('2d') as unknown as Ctx2D;
    ctx.save(); (ctx as any).setTransform(1, 0, 0, 1, 0, 0);
    desenharEncarte(ctx, { formato: ENCARTE_VERTICAL, grade, estilo: ESTILOS[c.tema.estilo], kit, itens, fundo: fundo as any, logo: logo as any, politica: c.tema.politica }, escala);
    ctx.restore();
  }, [kitApi, lojas]);
  useEffect(() => {
    if (!camp || !tela.current) return;
    let vivo = true;
    const cv = tela.current;
    const t = setTimeout(async () => {
      const off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
      await desenhar(off, camp, cv.width / ENCARTE_VERTICAL.w);
      if (vivo) cv.getContext('2d')!.drawImage(off, 0, 0);   // troca de uma vez: sem piscar
    }, 120);
    return () => { vivo = false; clearTimeout(t); };
  }, [camp, desenhar]);

  async function exportar() {
    if (!camp) return;
    setErro('');
    try {
      await api.post('/exportacoes/encarte');
      const cv = document.createElement('canvas'); cv.width = ENCARTE_VERTICAL.w; cv.height = ENCARTE_VERTICAL.h;
      await desenhar(cv, camp, 1);
      const blob: Blob = await new Promise((ok) => cv.toBlob((b) => ok(b!), 'image/png'));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = (camp.nome || 'encarte').replace(/[\\/:*?"<>|]+/g, '-') + '.png';
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (x) { setErro(x instanceof ErroApi ? x.message : 'Não foi possível exportar.'); }
  }

  if (!camp) return <p>Carregando…</p>;
  const capacidade = GRADES[camp.tema.grade].celulas.length;
  const sobrando = camp.itens.length - capacidade;

  return (
    <>
      <p><Link to="/encarte">← Encartes</Link></p>
      <div className="cabecalho">
        <div style={{ flex: 1 }}>
          <input aria-label="Nome da campanha" className="titulo-editavel" value={camp.nome} disabled={operador}
            onChange={(e) => mudar((c) => ({ ...c, nome: e.target.value }))} />
          <p className={'sub' + (estado.tipo === 'erro' ? ' texto-erro' : '')} role="status" style={{ marginBottom: 0 }}>{estado.texto || 'Tudo salvo'}</p>
        </div>
        <button className="primario" onClick={exportar}>Exportar PNG</button>
      </div>
      <Aviso>{erro}</Aviso>

      <div className="editor">
        <div>
          {!operador && (
            <div className="cartao">
              <div className="grade-2">
                <label>Grade<select value={camp.tema.grade} onChange={(e) => mudarTema({ grade: e.target.value })}>
                  {Object.keys(GRADES).map((g) => <option key={g} value={g}>{NOMES_GRADE[g]}</option>)}</select></label>
                <label>Caixa de preço<select value={camp.tema.estilo} onChange={(e) => mudarTema({ estilo: e.target.value })}>
                  {Object.values(ESTILOS).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
                <label>Loja<select value={camp.loja_id || ''} onChange={(e) => mudar((c) => ({ ...c, loja_id: e.target.value || null }))}>
                  <option value="">Sem loja</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
                <label>Tamanho do texto<select value={camp.tema.politica} onChange={(e) => mudarTema({ politica: e.target.value as PoliticaTexto })}>
                  <option value="maior">Maior possível</option><option value="medio">Médio</option><option value="minimo">Mínimo</option></select></label>
              </div>
              <label style={{ marginBottom: 0 }}>Fundo / tema
                <select value={camp.tema.fundo_id || ''} onChange={(e) => mudarTema({ fundo_id: e.target.value || null })}>
                  <option value="">Branco</option>{fundos.map((f) => <option key={f.id} value={f.id}>{f.nome}{f.global ? ' (EncartaAi)' : ''}</option>)}</select></label>
            </div>
          )}

          {sel !== null && camp.itens[sel] && <AjustesItem n={sel} item={camp.itens[sel]} selos={selos} aoFechar={() => setSel(null)}
            aoMudar={(campo, v) => mudarItem(sel, campo, v)} aoFoto={() => setFoto(sel)} />}

          <div className="cartao" style={{ padding: 0 }}>
            <div className="linha" style={{ padding: '12px 14px' }}>
              <strong>Produtos ({camp.itens.length})</strong><span className="espaco" />
              <button onClick={() => setColar(true)}>Colar lista</button>
              <button onClick={() => mudar((c) => ({ ...c, itens: [...c.itens, vazio()] }))}>+ Produto</button>
            </div>
            {sobrando > 0 && <div className="aviso" style={{ margin: '0 14px 10px' }}>A grade de {capacidade} mostra os {capacidade} primeiros; {sobrando} ficam de fora. Escolha uma grade maior.</div>}
            {camp.itens.length === 0 && <div className="vazio">Cole a lista de ofertas da semana ou adicione produto por produto.</div>}
            {camp.itens.length > 0 && (
              <table className="tabela-itens">
                <thead><tr><th style={{ width: 46 }}>Foto</th><th>Produto</th><th style={{ width: 92 }}>Preço</th><th style={{ width: 70 }}>Fator</th><th style={{ width: 96 }}></th></tr></thead>
                <tbody>{camp.itens.map((it, i) => (
                  <tr key={i} className={[i >= capacidade ? 'fora-da-grade' : '', it.oculto ? 'oculto' : '', sel === i ? 'selecionado' : ''].join(' ')}
                    onClick={(e) => { if (!(e.target as HTMLElement).closest('button,input')) setSel(i); }}>
                    <td><button className="miniatura-botao" onClick={() => setFoto(i)} title="Escolher foto" aria-label={'Foto de ' + (it.nome || 'produto')}>
                      {it.foto_id ? <img src={urlArquivo(it.foto_id)} alt="" /> : <span>+</span>}</button></td>
                    <td>
                      <input aria-label="Nome" value={it.nome} placeholder="Nome do produto" onChange={(e) => mudarItem(i, 'nome', e.target.value)} />
                      <input aria-label="Descrição" value={it.descricao} placeholder="Descrição (ex.: 5KG)" onChange={(e) => mudarItem(i, 'descricao', e.target.value)} className="sec" />
                      {it.candidatos && it.candidatos.length > 0 && !it.foto_id && (
                        <div className="sugestoes">Foto: {it.candidatos.map((c) => <button key={c.id} className="discreto" onClick={() => confirmarCandidato(i, c)}>{c.nome}?</button>)}</div>)}
                    </td>
                    <td><input aria-label="Preço" value={it.preco} placeholder="0,00" inputMode="decimal" onChange={(e) => mudarItem(i, 'preco', e.target.value)} /></td>
                    <td><input aria-label="Fator" value={it.fator} onChange={(e) => mudarItem(i, 'fator', e.target.value.toUpperCase())} /></td>
                    <td className="acoes-item">
                      <button className="discreto" aria-label="Ajustar" title="Ajustar foto, tamanhos e preço" onClick={() => setSel(i)}>⚙</button>
                      <button className="discreto" aria-label={it.oculto ? 'Mostrar' : 'Ocultar'} title={it.oculto ? 'Mostrar no encarte' : 'Ocultar do encarte (sem apagar)'}
                        onClick={() => mudarItem(i, 'oculto', !it.oculto)}>{it.oculto ? '🚫' : '👁'}</button>
                      <button className="discreto perigo" aria-label="Remover" onClick={() => { setSel(null); mudar((c) => ({ ...c, itens: c.itens.filter((_, j) => j !== i) })); }}>×</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>

        <div className="previa">
          <canvas ref={tela} width={540} height={960} aria-label="Prévia do encarte" />
        </div>
      </div>

      {colar && <ColarLista aoFechar={() => setColar(false)} aoAplicar={aplicarLista} temItens={camp.itens.length > 0} />}
      {foto !== null && <EscolherFoto item={camp.itens[foto]} podeEnviar={!operador} aoFechar={() => setFoto(null)}
        aoEscolher={(a, produtoId) => { mudar((c) => ({ ...c, itens: c.itens.map((x, j) => j === foto ? { ...x, foto_id: a ? a.id : null,
          produto_id: produtoId === undefined ? x.produto_id : produtoId, candidatos: undefined } : x) })); setFoto(null); }} />}
    </>
  );
}

function ColarLista({ aoFechar, aoAplicar, temItens }: { aoFechar: () => void; aoAplicar: (t: string, substituir: boolean) => void; temItens: boolean }) {
  const [texto, setTexto] = useState('');
  const n = lerLista(texto).length;
  return (
    <Modal titulo="Colar lista de ofertas" aoFechar={aoFechar} acoes={<>
      <button onClick={aoFechar}>Cancelar</button>
      {temItens && <button disabled={!n} onClick={() => aoAplicar(texto, false)}>Adicionar ao fim</button>}
      <button className="primario" disabled={!n} onClick={() => aoAplicar(texto, true)}>{temItens ? 'Substituir lista' : 'Usar lista'} ({n})</button>
    </>}>
      <p className="sub">Uma linha por produto. Vale colar do Excel (nome, descrição, preço, fator em colunas) ou escrever direto.</p>
      <textarea rows={9} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus
        placeholder={'ARROZ TIPO 1 5KG 24,90\nFEIJÃO CARIOCA 1KG 7,49 UN\nREFRIGERANTE 2L 7894900027013 9,99'} />
      <p className="sub" style={{ marginTop: 8 }}>As fotos vêm do banco pelo EAN ou pelo nome. O que ele não reconhecer, você escolhe na lista.</p>
    </Modal>
  );
}

function EscolherFoto({ item, podeEnviar, aoFechar, aoEscolher }: { item: ItemEd; podeEnviar: boolean; aoFechar: () => void;
  aoEscolher: (a: Asset | null, produtoId?: string | null) => void }) {
  const nome = item.nome;
  const [busca, setBusca] = useState(nome.split(' ')[0] || '');
  const [fotos, setFotos] = useState<Asset[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => {
    const t = setTimeout(async () => setFotos((await api.get<{ assets: Asset[] }>('/assets?tipo=produto&q=' + encodeURIComponent(busca))).assets), 200);
    return () => clearTimeout(t);
  }, [busca]);
  // Foto nova, sem sair do encarte: entra no banco já ligada ao produto,
  // para a próxima campanha achar sozinha.
  async function enviar(f: File | undefined) {
    if (!f) return;
    setEnviando(true); setErro('');
    try {
      const nomeArq = f.name.replace(/\.[a-z0-9]+$/i, '');
      const a = await api.enviarArquivo<Asset & { produto_id: string | null }>('/assets/arquivo?tipo=produto&nome=' + encodeURIComponent(nomeArq), f);
      let pid = a.produto_id || item.produto_id;
      if (!pid && nome.trim()) {
        pid = (await api.post<{ id: string }>('/produtos', { nome: nome.trim(), descricao: item.descricao || undefined })).id;
        await api.post('/banco/confirmar', { texto: [nome, item.descricao].join(' ').trim(), produto_id: pid }).catch(() => {});
      }
      if (pid && pid !== a.produto_id) await api.post(`/produtos/${pid}/imagens`, { asset_id: a.id, principal: true });
      aoEscolher(a, pid ?? null);
    } catch (x) { setErro(x instanceof ErroApi ? x.message : 'Não foi possível enviar.'); }
    setEnviando(false);
  }
  return (
    <Modal titulo={'Foto: ' + (nome || 'produto')} aoFechar={aoFechar} acoes={<button onClick={() => aoEscolher(null)}>Sem foto</button>}>
      <Aviso>{erro}</Aviso>
      <div className="linha">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no banco de imagens…" autoFocus style={{ flex: 1, margin: 0 }} />
        {podeEnviar && <label className="botao primario" style={{ margin: 0 }}>{enviando ? 'Enviando…' : 'Enviar do computador'}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={enviando} aria-label="Enviar foto do computador"
            onChange={(e) => enviar(e.target.files?.[0])} /></label>}
      </div>
      <div className="galeria" style={{ marginTop: 12, maxHeight: 360, overflow: 'auto', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
        {fotos?.map((a) => (
          <button key={a.id} className="miniatura" style={{ padding: 0 }} onClick={() => aoEscolher(a)} title={a.nome}>
            <div className="imagem"><img src={urlArquivo(a.id)} alt={a.nome} /></div><div className="info"><strong>{a.nome}</strong></div>
          </button>))}
        {fotos?.length === 0 && <p className="sub">Nada com esse nome no banco. {podeEnviar ? 'Envie a foto do computador: ela fica guardada para as próximas campanhas.' : ''}</p>}
      </div>
    </Modal>
  );
}

// Ajustes de um produto: foto, tamanhos, tipo de preço, selo.
function AjustesItem({ n, item, selos, aoFechar, aoMudar, aoFoto }: { n: number; item: ItemEd; selos: Asset[]; aoFechar: () => void;
  aoMudar: (campo: keyof ItemEd, v: unknown) => void; aoFoto: () => void }) {
  const a = item.foto_ajuste || { dx: 0, dy: 0, escala: 1 };
  const ajustarFoto = (d: Partial<typeof a>) => aoMudar('foto_ajuste', { ...a, ...d });
  const passo = (campo: 'escala_nome' | 'escala_preco', d: number) =>
    aoMudar(campo, Math.round(Math.min(1.5, Math.max(0.5, (item[campo] ?? 1) + d)) * 100) / 100);
  const combo = item.combo;
  const mudarCombo = (d: Partial<NonNullable<ItemEd['combo']>>) => aoMudar('combo', { ...(combo || { preco_fora: item.preco, qtd: 3, preco: '' }), ...d });
  const pct = (v: number | null | undefined) => Math.round((v ?? 1) * 100) + '%';
  return (
    <div className="cartao ajustes">
      <div className="linha"><strong>Produto {n + 1}: {item.nome || 'sem nome'}</strong><span className="espaco" />
        <button className="discreto" onClick={aoFechar} aria-label="Fechar ajustes">Fechar</button></div>
      <div className="grade-ajustes">
        <div>
          <div className="rotulo">Foto</div>
          <div className="linha">
            <button onClick={aoFoto}>{item.foto_id ? 'Trocar' : 'Escolher'}</button>
            <button aria-label="Diminuir foto" onClick={() => ajustarFoto({ escala: Math.max(0.2, +(a.escala - 0.1).toFixed(2)) })}>−</button>
            <span className="valor">{pct(a.escala)}</span>
            <button aria-label="Aumentar foto" onClick={() => ajustarFoto({ escala: Math.min(3, +(a.escala + 0.1).toFixed(2)) })}>+</button>
          </div>
          <div className="linha setas">
            <button aria-label="Foto para a esquerda" onClick={() => ajustarFoto({ dx: +(a.dx - 0.03).toFixed(2) })}>←</button>
            <button aria-label="Foto para cima" onClick={() => ajustarFoto({ dy: +(a.dy - 0.03).toFixed(2) })}>↑</button>
            <button aria-label="Foto para baixo" onClick={() => ajustarFoto({ dy: +(a.dy + 0.03).toFixed(2) })}>↓</button>
            <button aria-label="Foto para a direita" onClick={() => ajustarFoto({ dx: +(a.dx + 0.03).toFixed(2) })}>→</button>
            <button className="discreto" onClick={() => aoMudar('foto_ajuste', null)}>Restaurar</button>
          </div>
        </div>
        <div>
          <div className="rotulo">Tamanho do nome</div>
          <div className="linha"><button aria-label="Diminuir nome" onClick={() => passo('escala_nome', -0.05)}>−</button>
            <span className="valor">{pct(item.escala_nome)}</span><button aria-label="Aumentar nome" onClick={() => passo('escala_nome', 0.05)}>+</button></div>
          <div className="rotulo">Tamanho do preço</div>
          <div className="linha"><button aria-label="Diminuir preço" onClick={() => passo('escala_preco', -0.05)}>−</button>
            <span className="valor">{pct(item.escala_preco)}</span><button aria-label="Aumentar preço" onClick={() => passo('escala_preco', 0.05)}>+</button></div>
        </div>
        <div>
          <div className="rotulo">Selo</div>
          <select value={item.selo_id || ''} onChange={(e) => aoMudar('selo_id', e.target.value || null)} aria-label="Selo">
            <option value="">Sem selo</option>{selos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
          <label className="linha" style={{ marginTop: 8 }}><input type="checkbox" checked={!!item.oculto} style={{ width: 'auto', margin: 0 }}
            onChange={(e) => aoMudar('oculto', e.target.checked)} /> Ocultar do encarte</label>
        </div>
      </div>
      <div className="rotulo" style={{ marginTop: 10 }}>Caixa de preço</div>
      <div className="linha">
        <label className="linha"><input type="radio" name={'tipo' + n} checked={!combo} onChange={() => aoMudar('combo', null)} style={{ width: 'auto', margin: 0 }} /> Simples</label>
        <label className="linha"><input type="radio" name={'tipo' + n} checked={!!combo} onChange={() => mudarCombo({})} style={{ width: 'auto', margin: 0 }} /> Fora do app + Leve N por</label>
        {!combo && <input aria-label="Rótulo do app" placeholder="PREÇO NO APLICATIVO" value={item.rotulo_app || ''} onChange={(e) => aoMudar('rotulo_app', e.target.value)} style={{ flex: 1, margin: 0 }} />}
      </div>
      {combo && (
        <div className="grade-combo">
          <label>Fora do app<input aria-label="Preço fora do app" inputMode="decimal" value={combo.preco_fora} onChange={(e) => mudarCombo({ preco_fora: e.target.value })} placeholder="2,49" /></label>
          <label>Leve<input aria-label="Quantidade" type="number" min={1} max={99} value={combo.qtd} onChange={(e) => mudarCombo({ qtd: Number(e.target.value) || 1 })} /></label>
          <label>Por (no app)<input aria-label="Preço do combo" inputMode="decimal" value={combo.preco} onChange={(e) => mudarCombo({ preco: e.target.value })} placeholder="5,00" /></label>
          <label>Cada um sai<input aria-label="Preço unitário" inputMode="decimal" value={combo.unit || ''} onChange={(e) => mudarCombo({ unit: e.target.value })}
            placeholder={unitarioCombo({ precoFora: '', qtd: combo.qtd, preco: combo.preco }) || 'automático'} /></label>
        </div>
      )}
    </div>
  );
}
