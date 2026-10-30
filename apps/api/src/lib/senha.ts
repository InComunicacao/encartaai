// Senhas com PBKDF2-SHA256 (WebCrypto, nativo no Workers).
//
// 100.000 iterações é o teto que o Workers aceita para PBKDF2; acima
// disso a chamada falha. Formato guardado:
//   pbkdf2$<iterações>$<sal base64url>$<hash base64url>
// As iterações ficam no texto para que um aumento futuro não invalide as
// senhas antigas: cada uma é conferida com o número com que foi criada.

const ITERACOES = 100_000;
const BYTES_SAL = 16;
const BITS_HASH = 256;

export const SENHA_MINIMO = 8;

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deB64url(texto: string): Uint8Array {
  const b = atob(texto.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function derivar(senha: string, sal: Uint8Array, iteracoes: number): Promise<Uint8Array> {
  const chave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes }, chave, BITS_HASH);
  return new Uint8Array(bits);
}

export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(BYTES_SAL));
  const hash = await derivar(senha, sal, ITERACOES);
  return `pbkdf2$${ITERACOES}$${b64url(sal)}$${b64url(hash)}`;
}

// Comparação em tempo constante: comparar com === devolve mais cedo no
// primeiro byte diferente, e o tempo de resposta vaza quanto acertou.
function iguais(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i];
  return dif === 0;
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 4 || partes[0] !== 'pbkdf2') return false;
  const iteracoes = Number(partes[1]);
  if (!Number.isInteger(iteracoes) || iteracoes < 1 || iteracoes > ITERACOES) return false;
  const hash = await derivar(senha, deB64url(partes[2]), iteracoes);
  return iguais(hash, deB64url(partes[3]));
}

export function b64urlAleatorio(bytes: number): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256b64url(texto: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return b64url(new Uint8Array(d));
}
