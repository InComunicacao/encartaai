// Gera os PNGs do motor em 1080×1920 para comparar com a v2. Só roda com
// SAIDA_RENDER definido (é uma ferramenta, não uma verificação).
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { ENCARTE_VERTICAL, ETIQUETA_VERMELHA, GRADES, KIT_GOTHAM, desenharEncarte, type Ctx2D } from '../src';

const nomes = ['Arroz Tio João', 'Feijão Camil Carioca', 'Refrigerante Coca-Cola', 'Queijo Muçarela Fatiado', 'Óleo de Soja Liza', 'Café Pilão Tradicional', 'Leite Integral Itambé', 'Açúcar Refinado União', 'Macarrão Renata', 'Biscoito Oreo', 'Detergente Ypê', 'Papel Higiênico Neve'];
const descs = ['Tipo 1 5kg', 'Pacote 1kg', 'Pet 2L', 'Cada 100g', '900ml', '500g', '1L', '1kg', '500g', '90g', '500ml', '12 rolos'];
const precos = ['24,90', '7,49', '9,99', '3,29', '6,98', '18,90', '4,79', '4,29', '3,49', '2,99', '1,89', '19,90'];

it.skipIf(!process.env.SAIDA_RENDER)('gera comparação', () => {
  const pasta = process.env.FONTES_GOTHAM || '';
  if (pasta && existsSync(pasta)) for (const f of readdirSync(pasta).filter((x) => x.endsWith('.ttf'))) GlobalFonts.registerFromPath(join(pasta, f), f.replace('.ttf', ''));
  for (const L of ['4', '9', '12']) {
    const g = GRADES[L];
    const cv = createCanvas(1080, 1920);
    desenharEncarte(cv.getContext('2d') as unknown as Ctx2D, { formato: ENCARTE_VERTICAL, grade: g, estilo: ETIQUETA_VERMELHA, kit: KIT_GOTHAM,
      itens: g.celulas.map((_, i) => ({ nome: nomes[i % 12], descricao: descs[i % 12], preco: precos[i % 12], fator: i % 3 === 0 ? 'KG' : 'UN' })) });
    writeFileSync(join(process.env.SAIDA_RENDER!, `motor_grade${L}_1080.png`), cv.toBuffer('image/png'));
  }
});
