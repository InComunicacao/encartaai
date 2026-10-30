const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
// Precisa: wrangler dev com super admin daniel@incomunicacao.com.br / senha-super-123 (local),
// e em e2e/imagens: arroz.png, feijao.png, queijo.png (não versionadas).
const B = process.env.BASE || 'http://127.0.0.1:8787', N = String(Date.now() % 100000);
const IMG = path.join(__dirname, 'imagens');
const passos = []; const ok = (n, c, x = '') => passos.push((c ? 'PASS ' : 'FALHA ') + n + (x ? '  → ' + x : ''));

// Lê a duração (mvhd) e o tamanho (tkhd) de um MP4 sem dependências.
function lerMp4(buf) {
  const achar = (tipo, ini = 0, fim = buf.length) => {
    for (let i = ini; i + 8 <= fim;) {
      const t = buf.readUInt32BE(i), nome = buf.toString('latin1', i + 4, i + 8);
      if (nome === tipo) return { ini: i, fim: i + t };
      if (['moov', 'trak'].includes(nome)) { const r = achar(tipo, i + 8, i + t); if (r) return r; }
      if (t < 8) break; i += t;
    }
    return null;
  };
  const ftyp = buf.toString('latin1', 4, 8) === 'ftyp';
  const mvhd = achar('mvhd'), tkhd = achar('tkhd'), moov = achar('moov'), mdat = achar('mdat');
  const v = buf[mvhd.ini + 8];
  const escala = v ? buf.readUInt32BE(mvhd.ini + 28) : buf.readUInt32BE(mvhd.ini + 20);
  const dur = v ? Number(buf.readBigUInt64BE(mvhd.ini + 32)) : buf.readUInt32BE(mvhd.ini + 24);
  const tv = buf[tkhd.ini + 8], base = tkhd.ini + (tv ? 96 : 84);
  return { ftyp, segundos: dur / escala, w: buf.readUInt32BE(base) >> 16, h: buf.readUInt32BE(base + 4) >> 16, faststart: moov.ini < mdat.ini };
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(B + '/entrar');
  // cliente, fotos e campanha pela API (o fluxo do encarte já é testado em editor.cjs)
  const fotos = ['arroz.png', 'feijao.png', 'queijo.png'].map((f) => Array.from(fs.readFileSync(path.join(IMG, f))));
  const camp = await p.evaluate(async ({ N, fotos }) => {
    const j = (m, u, d) => fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(d ?? {}) }).then((r) => r.json());
    await j('POST', '/api/auth/entrar', { email: 'daniel@incomunicacao.com.br', senha: 'senha-super-123' });
    await j('POST', '/api/admin/clientes', { nome: 'Mercado Vídeo ' + N, slug: 'video-' + N, plano_id: 'completo',
      dono: { email: `video${N}@mercado.test`, nome: 'Dona Vídeo', senha: 'senha-dono-123' } });
    await j('POST', '/api/auth/sair');
    await j('POST', '/api/auth/entrar', { email: `video${N}@mercado.test`, senha: 'senha-dono-123' });
    const ids = [];
    for (const [i, f] of fotos.entries()) {
      const r = await fetch('/api/assets/arquivo?tipo=produto&nome=foto' + i, { method: 'POST', headers: { 'content-type': 'image/png' }, body: new Uint8Array(f) });
      ids.push((await r.json()).id);
    }
    const c = await j('POST', '/api/campanhas', { nome: 'Ofertas da TV' });
    await j('PUT', '/api/campanhas/' + c.id, { itens: [
      { nome: 'Arroz Tipo 1', descricao: '5KG', preco: '24,90', fator: 'UN', foto_id: ids[0] },
      { nome: 'Feijão Carioca', descricao: '1KG', preco: '7,49', fator: 'UN', foto_id: ids[1] },
      { nome: 'Queijo Muçarela', descricao: 'Fatiado', preco: '3,29', fator: 'CADA 100G', foto_id: ids[2] }] });
    return c.id;
  }, { N, fotos });
  ok('campanha com 3 produtos', !!camp);
  await p.goto(B + '/');
  await p.click('nav a:has-text("Vídeo e LED")');
  await p.waitForSelector('h1:has-text("Vídeo e LED")');
  ok('módulo vídeo aberto (sem "em breve")', await p.locator('text=em construção').count() === 0);
  await p.click('button:has-text("Ofertas da TV")');
  await p.waitForSelector('canvas[aria-label="Prévia do vídeo"]');
  await p.waitForTimeout(1500);
  const pintado = () => p.locator('canvas[aria-label="Prévia do vídeo"]').evaluate((c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 4 * 13) if (d[i] > 200 && d[i + 1] < 40 && d[i + 2] < 50) n++; return n; });
  ok('prévia anima com a caixa de preço', (await pintado()) > 50, String(await pintado()));
  ok('3 produtos marcados', (await p.locator('.tabela-itens input[type=checkbox]:checked').count()) === 3);

  // formato próprio: painel com limite de 2 produtos
  await p.click('button:has-text("+ Formato")');
  await p.fill('.modal label:has-text("Nome") input', 'LED da fachada');
  await p.fill('.modal label:has-text("Largura") input', '601');
  await p.fill('.modal label:has-text("Altura") input', '480');
  await p.click('.modal button:has-text("Salvar")');
  ok('recusa medida ímpar com mensagem clara', await p.waitForSelector('.modal >> text=medidas pares', { timeout: 5000 }).then(() => true, () => false));
  await p.fill('.modal label:has-text("Largura") input', '720');
  await p.fill('.modal label:has-text("Máximo de produtos") input', '2');
  await p.click('.modal button:has-text("Salvar")');
  await p.waitForSelector('td:has-text("LED da fachada")');
  await p.selectOption('label:has-text("Formato") select', { label: 'LED da fachada — 720×480' });
  await p.waitForTimeout(300);
  ok('limite do painel: só 2 marcados', (await p.locator('.tabela-itens input[type=checkbox]:checked').count()) === 2);
  await p.selectOption('label:has-text("Fundo") select', 'cor');
  await p.fill('label:has-text("Segundos por produto") input', '3');

  const dl = p.waitForEvent('download', { timeout: 120000 });
  await p.click('button:has-text("Exportar MP4")');
  const d = await dl; const destino = path.join(os.tmpdir(), 'video_led.mp4'); await d.saveAs(destino);
  const m = lerMp4(fs.readFileSync(destino));
  ok('nome do arquivo', d.suggestedFilename() === 'Ofertas da TV - LED da fachada.mp4', d.suggestedFilename());
  ok('MP4 de verdade (ftyp, moov antes do mdat)', m.ftyp && m.faststart, JSON.stringify(m));
  ok('tamanho do painel 720×480', m.w === 720 && m.h === 480);
  ok('duração exata: 2 produtos × 3 s', Math.abs(m.segundos - 6) < 0.05, m.segundos.toFixed(3));

  // Stories (TV vertical girada também)
  await p.selectOption('label:has-text("Formato") select', { label: 'TV em pé (girada) — 1920×1080' });
  await p.fill('label:has-text("Segundos por produto") input', '2');
  const dl2 = p.waitForEvent('download', { timeout: 180000 });
  await p.click('button:has-text("Exportar MP4")');
  const d2 = await dl2; const destino2 = path.join(os.tmpdir(), 'video_tv.mp4'); await d2.saveAs(destino2);
  const m2 = lerMp4(fs.readFileSync(destino2));
  ok('TV girada sai 1920×1080 com 3 × 2 s', m2.w === 1920 && m2.h === 1080 && Math.abs(m2.segundos - 6) < 0.05, JSON.stringify(m2));
  await p.screenshot({ path: path.join(os.tmpdir(), 'video_tela.png') });
  ok('sem erros de JavaScript', erros.length === 0, erros.join(' | '));
  console.log(passos.join('\n') + '\n\n' + passos.filter((x) => x.startsWith('PASS')).length + '/' + passos.length);
  await b.close();
})().catch((e) => { console.log(passos.join('\n')); console.log('ERRO:', e.message.split('\n')[0]); process.exit(1); });
