import { SELF } from 'cloudflare:test';

export const BASE = 'https://api.encartaai.test/api';
export type R = { status: number; json: any; cookie: string | null; headers: Headers; bytes?: Uint8Array };

export async function req(metodo: string, caminho: string, corpo?: unknown, cookie?: string | null, extra: Record<string, string> = {}): Promise<R> {
  const h: Record<string, string> = { ...extra };
  if (corpo !== undefined && !h['content-type']) h['content-type'] = 'application/json';
  if (cookie) h['cookie'] = cookie;
  const body = corpo === undefined ? undefined : corpo instanceof Uint8Array ? corpo : JSON.stringify(corpo);
  const r = await SELF.fetch(BASE + caminho, { method: metodo, headers: h, body });
  const sc = r.headers.get('set-cookie');
  const tipo = r.headers.get('content-type') || '';
  if (tipo.includes('json')) return { status: r.status, json: await r.json(), cookie: sc ? sc.split(';')[0] : null, headers: r.headers };
  return { status: r.status, json: null, cookie: sc ? sc.split(';')[0] : null, headers: r.headers, bytes: new Uint8Array(await r.arrayBuffer()) };
}

export const entrar = async (email: string, senha: string) => (await req('POST', '/auth/entrar', { email, senha })).cookie;

export async function enviar(cookie: string | null, bytes: Uint8Array, mime: string, query: string, admin = false) {
  return req('POST', (admin ? '/admin/banco' : '') + '/assets/arquivo?' + query, bytes, cookie, { 'content-type': mime });
}

// Cria super admin + dois clientes e devolve as sessões.
export async function montarCenario() {
  await req('POST', '/setup', { token: 'token-de-teste-com-mais-de-16', email: 'super@encartaai.test', nome: 'Super', senha: 'senha-super-123' });
  const SUPER = await entrar('super@encartaai.test', 'senha-super-123');
  const a = await req('POST', '/admin/clientes', { nome: 'Terê Frutas', slug: 'terefrutas', plano_id: 'completo',
    dono: { email: 'dono@tere.test', nome: 'Dono A', senha: 'senha-dono-a1' } }, SUPER);
  const b = await req('POST', '/admin/clientes', { nome: 'Mercado B', slug: 'mercadob', plano_id: 'basico',
    dono: { email: 'dono@b.test', nome: 'Dono B', senha: 'senha-dono-b1' } }, SUPER);
  return { SUPER, TA: a.json.id as string, TB: b.json.id as string,
    A: await entrar('dono@tere.test', 'senha-dono-a1'), B: await entrar('dono@b.test', 'senha-dono-b1') };
}

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// PNG real de 1×1.
export const PNG_1x1 = b64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
// Cabeçalho JPEG com SOF0 de 64×32 (o suficiente para o detector e as dimensões).
export const JPEG_64x32 = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x40, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);
export const WOFF2 = new Uint8Array([...'wOF2'].map((c) => c.charCodeAt(0)).concat(new Array(40).fill(0)));
export const HTML_DISFARCADO = new TextEncoder().encode('<html><script>alert(1)</script></html>');
