// Tipo REAL do arquivo, lido dos primeiros bytes.
//
// O nome e o Content-Type vêm de quem envia e podem mentir: um HTML com
// nome "foto.png" serviria script no nosso domínio. Por isso o tipo é
// decidido pela assinatura binária, e só os formatos abaixo entram.
//
// SVG fica de fora de propósito: é texto que pode carregar <script>.
// Logo vetorial entra como PNG/WebP por enquanto.

export interface TipoArquivo { mime: string; ext: string; categoria: 'imagem' | 'fonte' }

export function detectarTipo(b: Uint8Array): TipoArquivo | null {
  const tem = (off: number, ...bytes: number[]) => bytes.every((v, i) => b[off + i] === v);
  const ascii = (off: number, s: string) => [...s].every((ch, i) => b[off + i] === ch.charCodeAt(0));
  if (b.length < 12) return null;
  if (tem(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: 'image/png', ext: 'png', categoria: 'imagem' };
  if (tem(0, 0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', ext: 'jpg', categoria: 'imagem' };
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return { mime: 'image/webp', ext: 'webp', categoria: 'imagem' };
  if (ascii(0, 'wOF2')) return { mime: 'font/woff2', ext: 'woff2', categoria: 'fonte' };
  if (ascii(0, 'wOFF')) return { mime: 'font/woff', ext: 'woff', categoria: 'fonte' };
  if (tem(0, 0x00, 0x01, 0x00, 0x00) || ascii(0, 'true')) return { mime: 'font/ttf', ext: 'ttf', categoria: 'fonte' };
  if (ascii(0, 'OTTO')) return { mime: 'font/otf', ext: 'otf', categoria: 'fonte' };
  return null;
}

// Largura e altura sem decodificar a imagem (Workers não tem canvas).
export function dimensoes(b: Uint8Array, mime: string): { w: number; h: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    if (mime === 'image/png') return { w: dv.getUint32(16), h: dv.getUint32(20) };
    if (mime === 'image/webp') {
      const tipo = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (tipo === 'VP8X') return { w: 1 + (b[24] | b[25] << 8 | b[26] << 16), h: 1 + (b[27] | b[28] << 8 | b[29] << 16) };
      if (tipo === 'VP8 ') return { w: dv.getUint16(26, true) & 0x3fff, h: dv.getUint16(28, true) & 0x3fff };
      if (tipo === 'VP8L') {
        const v = dv.getUint32(21, true);
        return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 };
      }
    }
    if (mime === 'image/jpeg') {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) return null;
        const m = b[i + 1];
        const len = dv.getUint16(i + 2);
        // SOF0..SOF15, menos DHT(C4), JPG(C8) e DAC(CC)
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
          return { h: dv.getUint16(i + 5), w: dv.getUint16(i + 7) };
        i += 2 + len;
      }
    }
  } catch { /* arquivo truncado */ }
  return null;
}
