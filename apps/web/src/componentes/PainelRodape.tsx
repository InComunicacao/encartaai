// Rodapé 100% personalizado: blocos de texto com tamanho, negrito e
// alinhamento; personagem; cores ou transparente; validade da campanha.
import type { Asset } from '../api';
import { BLOCOS_PRONTOS, type BlocoRodapeApi, type RodapeApi } from '../render-web';

interface Props {
  rodape: RodapeApi;
  personagens: Asset[];
  validade: { de: string | null; ate: string | null };
  temLojaTexto: boolean;
  aoMudar: (r: RodapeApi) => void;
  aoValidade: (v: { de: string | null; ate: string | null }) => void;
  aoRestaurar: () => void;
}

export function PainelRodape({ rodape, personagens, validade, temLojaTexto, aoMudar, aoValidade, aoRestaurar }: Props) {
  const m = (d: Partial<RodapeApi>) => aoMudar({ ...rodape, ...d });
  const mb = (i: number, d: Partial<BlocoRodapeApi>) => m({ blocos: rodape.blocos.map((b, j) => j === i ? { ...b, ...d } : b) });
  const mover = (i: number, d: number) => {
    const b = [...rodape.blocos]; const [x] = b.splice(i, 1); b.splice(i + d, 0, x); m({ blocos: b });
  };
  const usaDatas = rodape.blocos.some((b) => /\{de\}|\{ate\}/i.test(b.texto) && !b.oculto);
  return (
    <div className="cartao painel-rodape">
      <div className="grade-2">
        <label>Validade: de<input type="date" value={validade.de || ''} onChange={(e) => aoValidade({ ...validade, de: e.target.value || null })} /></label>
        <label>até<input type="date" value={validade.ate || ''} onChange={(e) => aoValidade({ ...validade, ate: e.target.value || null })} /></label>
      </div>
      {!usaDatas && (validade.de || validade.ate) && <p className="sub" style={{ marginTop: -6 }}>Nenhum texto usa as datas. Escreva {'{de}'} e {'{ate}'} num bloco, ou adicione "Validade com as datas".</p>}

      <div className="grade-2">
        <label>Personagem<select value={rodape.personagem_id || ''} onChange={(e) => m({ personagem_id: e.target.value || null })}>
          <option value="">Sem personagem</option>{personagens.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
        <div>
          <label className="linha" style={{ marginTop: 26 }}><input type="checkbox" checked={rodape.transparente} style={{ width: 'auto', margin: 0 }}
            onChange={(e) => m({ transparente: e.target.checked, ...(e.target.checked && !rodape.cor_texto ? { cor_texto: '#111111' } : {}) })} /> Rodapé transparente</label>
        </div>
      </div>
      <div className="cores-rodape">
        {!rodape.transparente && <Cor rotulo="Fundo" valor={rodape.cor_fundo} aoMudar={(v) => m({ cor_fundo: v })} />}
        <Cor rotulo="Textos" valor={rodape.cor_texto} aoMudar={(v) => m({ cor_texto: v })} />
        <Cor rotulo="Barras" valor={rodape.cor_barras} aoMudar={(v) => m({ cor_barras: v })} />
      </div>

      <div className="linha" style={{ margin: '14px 0 6px' }}><strong>Textos do rodapé</strong><span className="espaco" />
        <button className="discreto" onClick={aoRestaurar}>Voltar ao padrão do kit</button></div>
      {rodape.blocos.map((b, i) => (
        <div key={i} className={'bloco-rodape' + (b.oculto ? ' oculto' : '')}>
          <textarea rows={2} value={b.texto} aria-label={'Texto do bloco ' + (i + 1)} onChange={(e) => mb(i, { texto: e.target.value })} />
          <div className="linha">
            <button aria-label="Diminuir texto" title="Diminuir" onClick={() => mb(i, { tamanho: Math.max(0.3, +(b.tamanho - 0.1).toFixed(2)) })}>A−</button>
            <span className="valor">{Math.round(b.tamanho * 100)}%</span>
            <button aria-label="Aumentar texto" title="Aumentar" onClick={() => mb(i, { tamanho: Math.min(3, +(b.tamanho + 0.1).toFixed(2)) })}>A+</button>
            <button className={b.negrito ? 'ativo' : ''} aria-pressed={b.negrito} title="Negrito" onClick={() => mb(i, { negrito: !b.negrito })}><b>N</b></button>
            {(['esquerda', 'centro', 'direita'] as const).map((a) => (
              <button key={a} className={b.alinhar === a ? 'ativo' : ''} aria-pressed={b.alinhar === a} title={'Alinhar à ' + a}
                onClick={() => mb(i, { alinhar: a })}>{a === 'esquerda' ? '⇤' : a === 'centro' ? '↔' : '⇥'}</button>))}
            <span className="espaco" />
            <button className="discreto" disabled={i === 0} aria-label="Subir bloco" onClick={() => mover(i, -1)}>↑</button>
            <button className="discreto" disabled={i === rodape.blocos.length - 1} aria-label="Descer bloco" onClick={() => mover(i, 1)}>↓</button>
            <button className="discreto" title={b.oculto ? 'Mostrar' : 'Ocultar'} aria-label={b.oculto ? 'Mostrar bloco' : 'Ocultar bloco'}
              onClick={() => mb(i, { oculto: !b.oculto })}>{b.oculto ? '🚫' : '👁'}</button>
            <button className="discreto perigo" aria-label="Apagar bloco" onClick={() => m({ blocos: rodape.blocos.filter((_, j) => j !== i) })}>×</button>
          </div>
        </div>
      ))}
      {rodape.blocos.length < 8 && (
        <div className="linha">
          <select aria-label="Adicionar texto" value="" onChange={(e) => {
            const k = e.target.value; if (!k) return;
            const novo = k === 'livre' ? { texto: '', tamanho: 0.7, negrito: false, alinhar: 'centro' as const, oculto: false } : BLOCOS_PRONTOS[Number(k)].bloco;
            m({ blocos: [...rodape.blocos, { ...novo }] });
          }} style={{ margin: 0, maxWidth: 320 }}>
            <option value="">+ Adicionar texto…</option>
            <option value="livre">Texto livre</option>
            {BLOCOS_PRONTOS.map((p, k) => <option key={k} value={k}>{p.nome}</option>)}
          </select>
        </div>
      )}
      <p className="sub" style={{ marginTop: 10, marginBottom: 0 }}>
        Use {'{de}'} e {'{ate}'} para as datas, {'{loja}'} para o nome da loja e {'{loja_texto}'} para o texto da loja
        {temLojaTexto ? '' : ' (cadastre em Lojas → Texto do rodapé)'}.
      </p>
    </div>
  );
}

function Cor({ rotulo, valor, aoMudar }: { rotulo: string; valor: string | null; aoMudar: (v: string | null) => void }) {
  return (
    <div className="cor-rodape"><span className="rotulo-cor">{rotulo}</span>
      <span className="linha"><input type="color" value={valor || '#ffffff'} onChange={(e) => aoMudar(e.target.value)} aria-label={'Cor: ' + rotulo} />
        {valor ? <button className="discreto" onClick={() => aoMudar(null)} title="Usar a cor do kit">kit</button> : <span className="sub" style={{ margin: 0 }}>do kit</span>}</span>
    </div>
  );
}
