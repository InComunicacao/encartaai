// Cliente da API. Um lugar só para: JSON, erros com mensagem em
// português, e o caso especial da sessão derrubada por outro computador.

export class ErroApi extends Error {
  constructor(public status: number, public codigo: string, mensagem: string, public dados: any = {}) {
    super(mensagem);
  }
}

// Quem mostra o aviso de "sessão encerrada" se registra aqui (App.tsx).
let aoPerderSessao: ((codigo: string, mensagem: string) => void) | null = null;
export function quandoPerderSessao(fn: typeof aoPerderSessao) { aoPerderSessao = fn; }

const SESSAO_PERDIDA = new Set(['sessao_substituida', 'sessao_expirada', 'sessao_encerrada', 'sessao_invalida', 'cliente_suspenso', 'usuario_inativo']);

async function chamar<T>(metodo: string, caminho: string, corpo?: unknown, tipo = 'application/json'): Promise<T> {
  const init: RequestInit = { method: metodo, credentials: 'same-origin', headers: {} };
  if (corpo !== undefined) {
    (init.headers as Record<string, string>)['content-type'] = tipo;
    init.body = corpo instanceof Blob || corpo instanceof ArrayBuffer ? corpo : JSON.stringify(corpo);
  }
  const r = await fetch('/api' + caminho, init);
  const dados = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
  if (!r.ok) {
    const codigo = dados?.erro || 'erro';
    const msg = dados?.mensagem || 'Não foi possível concluir. Tente de novo.';
    // Sessão perdida: o aviso global assume, e a chamada fica pendente para
    // sempre. Lançar aqui obrigaria cada tela a tratar um caso que não é
    // dela — e a que esquecesse deixaria um erro solto no console.
    if (r.status === 401 && SESSAO_PERDIDA.has(codigo) && aoPerderSessao) {
      aoPerderSessao(codigo, msg);
      return new Promise<T>(() => {});
    }
    throw new ErroApi(r.status, codigo, msg, dados);
  }
  return dados as T;
}

export const api = {
  get: <T>(c: string) => chamar<T>('GET', c),
  post: <T>(c: string, corpo: unknown = {}) => chamar<T>('POST', c, corpo),
  put: <T>(c: string, corpo: unknown = {}) => chamar<T>('PUT', c, corpo),
  del: <T>(c: string, corpo: unknown = {}) => chamar<T>('DELETE', c, corpo),
  enviarArquivo: <T>(c: string, arquivo: File) => chamar<T>('POST', c, arquivo, arquivo.type || 'application/octet-stream'),
};

// ── tipos que as telas usam ─────────────────────────────────────────
export type Papel = 'super' | 'dono' | 'editor' | 'operador';
export interface Eu {
  usuario: { id: string; email: string; nome: string; papel: Papel };
  cliente: { id: string; nome: string; slug: string; plano_id: string; plano_nome: string; creditos_ia_mes: number } | null;
  modulos: string[];
  acessos?: { limite: number; emUso: number };
}
export interface Asset {
  id: string; tipo: string; nome: string; mime: string; bytes: number;
  largura: number | null; altura: number | null; etiquetas: string[]; global: boolean; criado_em: number;
}
export const urlArquivo = (id: string) => `/api/assets/${id}/arquivo`;

export const fmtBytes = (n: number) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
export const fmtReais = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
