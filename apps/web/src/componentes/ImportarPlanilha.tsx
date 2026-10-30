// Importar produtos de uma planilha (Excel .xlsx ou .csv).
// A leitura é no navegador: o arquivo nunca sobe, só as linhas.
// As colunas são reconhecidas pelo título (EAN, código de barras, produto,
// descrição…); o que não for reconhecido a pessoa escolhe na hora.
import { useState } from 'react';
import { api, ErroApi } from '../api';
import { Aviso, Modal } from './Modal';

type Campo = 'ean' | 'nome' | 'descricao' | 'categoria' | '';
const CAMPOS: { id: Campo; nome: string }[] = [
  { id: '', nome: '— ignorar —' }, { id: 'ean', nome: 'EAN' }, { id: 'nome', nome: 'Nome' },
  { id: 'descricao', nome: 'Descrição' }, { id: 'categoria', nome: 'Categoria' },
];
const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export function adivinharCampo(titulo: string): Campo {
  const t = sem(titulo);
  if (/(^|\b)(ean|gtin|cod(igo)?\.? ?(de )?barras?|cod ?barra|barcode)/.test(t)) return 'ean';
  if (/(categ|secao|departamento|grupo)/.test(t)) return 'categoria';
  if (/(descri|complemento|embalagem|gramatura|medida|peso)/.test(t)) return 'descricao';
  if (/(nome|produto|item|mercadoria)/.test(t)) return 'nome';
  return '';
}

// CSV simples: ; ou , como separador, aspas opcionais.
export function lerCsv(texto: string): string[][] {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return [];
  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';
  return linhas.map((l) => {
    const out: string[] = []; let atual = '', aspas = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (aspas && l[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas; }
      else if (ch === sep && !aspas) { out.push(atual); atual = ''; }
      else atual += ch;
    }
    out.push(atual);
    return out.map((x) => x.trim());
  });
}

async function lerArquivo(f: File): Promise<string[][]> {
  if (/\.csv$|\.txt$/i.test(f.name)) return lerCsv(await f.text());
  if (/\.xls$/i.test(f.name)) throw new Error('Arquivo .xls antigo: no Excel, use "Salvar como" → Pasta de Trabalho do Excel (.xlsx).');
  const { readSheet } = await import('read-excel-file/browser');
  // números como texto: EAN com zero na frente continua com o zero
  const dados = await readSheet(f, { parseNumber: (s: string) => s });
  return (dados as unknown[][]).map((l) => l.map((c) => c == null ? '' : String(c).trim()));
}

interface Resultado { criados: number; atualizados: number; ignorados: number; total_erros: number; erros: { linha: number; motivo: string }[]; fotos_ligadas: number }

export function ImportarPlanilha({ aoFechar, aoConcluir }: { aoFechar: () => void; aoConcluir: () => void }) {
  const [linhas, setLinhas] = useState<string[][] | null>(null);
  const [mapa, setMapa] = useState<Campo[]>([]);
  const [titulo, setTitulo] = useState(true);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);

  async function escolher(f: File | undefined) {
    if (!f) return;
    setErro(''); setRes(null);
    try {
      const l = (await lerArquivo(f)).filter((x) => x.some(Boolean));
      if (!l.length) { setErro('A planilha está vazia.'); return; }
      const m = l[0].map(adivinharCampo);
      const temTitulo = m.some(Boolean);
      // sem títulos reconhecíveis: coluna de 8–14 dígitos é EAN, a primeira com letras é o nome
      if (!temTitulo) {
        const amostra = l.slice(0, 20);
        l[0].forEach((_, c) => {
          if (amostra.every((x) => !x[c] || /^\d{8,14}$/.test(x[c]))) m[c] = 'ean';
        });
        const n = l[0].findIndex((_, c) => m[c] === '' && amostra.some((x) => /[a-z]/i.test(x[c] || '')));
        if (n >= 0) m[n] = 'nome';
      }
      setTitulo(temTitulo); setLinhas(l); setMapa(m);
    } catch (x) { setErro(x instanceof Error ? x.message : 'Não foi possível ler o arquivo.'); }
  }

  const corpo = linhas ? (titulo ? linhas.slice(1) : linhas) : [];
  const temNome = mapa.includes('nome');
  async function importar() {
    setEnviando(true); setErro('');
    const col = (campo: Campo) => mapa.indexOf(campo);
    const pegar = (l: string[], campo: Campo) => (col(campo) >= 0 ? l[col(campo)] || '' : '');
    try {
      const r = await api.post<Resultado>('/produtos/lote', { linhas: corpo.map((l) => ({
        ean: pegar(l, 'ean'), nome: pegar(l, 'nome'), descricao: pegar(l, 'descricao'), categoria: pegar(l, 'categoria') })) });
      setRes(r); aoConcluir();
    } catch (x) { setErro(x instanceof ErroApi ? x.message : 'Falhou.'); }
    setEnviando(false);
  }

  return (
    <Modal titulo="Importar produtos da planilha" aoFechar={aoFechar} acoes={res ? <button className="primario" onClick={aoFechar}>Pronto</button> : <>
      <button onClick={aoFechar}>Cancelar</button>
      <button className="primario" disabled={!linhas || !temNome || enviando} onClick={importar}>{enviando ? 'Importando…' : `Importar ${corpo.length} produtos`}</button></>}>
      <Aviso>{erro}</Aviso>
      {res ? (
        <div>
          <p><strong>{res.criados}</strong> produtos novos · <strong>{res.atualizados}</strong> atualizados pelo EAN
            {res.ignorados > 0 && <> · {res.ignorados} já existiam</>}{res.fotos_ligadas > 0 && <> · <strong>{res.fotos_ligadas}</strong> fotos ligadas pelo EAN</>}</p>
          {res.total_erros > 0 && <div className="aviso">{res.total_erros} linhas ficaram de fora: {res.erros.slice(0, 8).map((e) => `linha ${e.linha + (titulo ? 1 : 0)} (${e.motivo})`).join(', ')}{res.total_erros > 8 ? '…' : ''}</div>}
          <p className="sub">Fotos com o EAN no nome do arquivo (ex.: 7894900027013.png) se ligam sozinhas ao produto ao serem enviadas no Banco de imagens.</p>
        </div>
      ) : (
        <>
          <p className="sub">Excel (.xlsx) ou CSV. Uma linha por produto, com colunas como EAN, Nome e Descrição. Importar de novo atualiza pelo EAN, sem duplicar.</p>
          <input type="file" accept=".xlsx,.csv,.txt,.xls" aria-label="Planilha" onChange={(e) => escolher(e.target.files?.[0])} />
          {linhas && (
            <>
              <label className="linha" style={{ marginTop: 12 }}><input type="checkbox" checked={titulo} onChange={(e) => setTitulo(e.target.checked)} style={{ width: 'auto', margin: 0 }} />
                A primeira linha é o título das colunas</label>
              <div style={{ overflow: 'auto', maxHeight: 280, marginTop: 8 }}>
                <table className="tabela-planilha">
                  <thead><tr>{mapa.map((m, c) => <th key={c}><select aria-label={'Coluna ' + (c + 1)} value={m}
                    onChange={(e) => setMapa((x) => x.map((v, k) => k === c ? e.target.value as Campo : (v === e.target.value && v ? '' : v)))}>
                    {CAMPOS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></th>)}</tr></thead>
                  <tbody>{(titulo ? linhas.slice(0, 7) : linhas.slice(0, 6)).map((l, i) => (
                    <tr key={i} className={titulo && i === 0 ? 'titulo' : ''}>{mapa.map((_, c) => <td key={c}>{l[c]}</td>)}</tr>))}</tbody>
                </table>
              </div>
              {!temNome && <div className="aviso" style={{ marginTop: 8 }}>Escolha qual coluna é o <strong>Nome</strong> do produto.</div>}
            </>
          )}
        </>
      )}
    </Modal>
  );
}
