const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
// Parte 4D/E: desfazer/refazer, zoom, tamanhos e cores gerais, exportações e modelo.
const B = process.env.BASE || 'http://127.0.0.1:8787', N = String(Date.now() % 100000);
const passos = []; const ok = (n, c, x = '') => passos.push((c ? 'PASS ' : 'FALHA ') + n + (x ? '  → ' + x : ''));
const tamPng = (f) => { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(B + '/entrar');
  const [id, id2] = await p.evaluate(async ({ N }) => {
    const j = (m, u, d) => fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(d ?? {}) }).then((r) => r.json());
    await j('POST', '/api/auth/entrar', { email: 'daniel@incomunicacao.com.br', senha: 'senha-super-123' });
    await j('POST', '/api/admin/clientes', { nome: 'Mercado 4D ' + N, slug: 'm4d-' + N, plano_id: 'completo', dono: { email: `m4d${N}@x.test`, nome: 'Dona', senha: 'senha-dono-123' } });
    await j('POST', '/api/auth/sair');
    await j('POST', '/api/auth/entrar', { email: `m4d${N}@x.test`, senha: 'senha-dono-123' });
    const c = await j('POST', '/api/campanhas', { nome: 'Ofertas Semana' });
    await j('PUT', '/api/campanhas/' + c.id, { tema: { grade: '4' }, itens: [{ nome: 'Arroz', preco: '24,90' }, { nome: 'Feijão', preco: '7,49' }] });
    const c2 = await j('POST', '/api/campanhas', { nome: 'Outra' });
    return [c.id, c2.id];
  }, { N });
  await p.goto(B + '/encarte/' + id);
  await p.waitForSelector('.palco canvas'); await p.waitForTimeout(600);
  const tema = (cid = id) => p.evaluate(async (cid) => (await (await fetch('/api/campanhas/' + cid)).json()).campanha.tema, cid);
  const salvo = async () => { await p.waitForSelector('text=Salvo às', { timeout: 10000 }); await p.waitForTimeout(1400); };

  // tamanhos gerais
  await p.click('summary:has-text("Tamanhos e cores do preço")');
  await p.click('button[aria-label="Diminuir todos os preços"]'); await p.waitForTimeout(700);
  await p.click('button[aria-label="Diminuir todos os preços"]');
  await p.waitForTimeout(700);
  await p.fill('input[aria-label="Cor: Caixa do preço"]', '#0057b8');
  await salvo();
  let t = await tema();
  ok('tamanho geral do preço e cor da caixa', t.escala_preco === 0.9 && t.cores.caixa_preco === '#0057b8', JSON.stringify([t.escala_preco, t.cores]));
  // desfazer / refazer
  await p.click('button[aria-label="Desfazer"]'); await salvo();
  ok('desfazer volta a cor', !(await tema()).cores?.caixa_preco);
  await p.click('button[aria-label="Desfazer"]'); await salvo();
  ok('desfazer de novo volta o tamanho', (await tema()).escala_preco === 0.95);
  await p.keyboard.press('Control+Shift+Z'); await salvo();
  ok('Ctrl+Shift+Z refaz', (await tema()).escala_preco === 0.9);
  await p.keyboard.press('Control+Z'); await salvo();
  ok('Ctrl+Z desfaz', (await tema()).escala_preco === 0.95);
  // zoom
  const w0 = (await p.locator('.palco').boundingBox()).width;
  await p.click('button[aria-label="Aumentar zoom"]'); await p.click('button[aria-label="Aumentar zoom"]');
  const w1 = (await p.locator('.palco').boundingBox()).width;
  ok('zoom aumenta a prévia', w1 > w0 * 1.4, `${w0.toFixed(0)} → ${w1.toFixed(0)}`);
  await p.click('.barra-zoom button.discreto');
  // exportações
  const exportar = async (rotulo, nome) => {
    await p.click('button[aria-label="Mais formatos"]');
    const dl = p.waitForEvent('download'); await p.click(`.menu button:has-text("${rotulo}")`);
    const d = await dl; const f = path.join(os.tmpdir(), nome); await d.saveAs(f); return { f, nome: d.suggestedFilename() };
  };
  let r = await exportar('PNG em alta', 'e2x.png'); ok('PNG 2x 2160×3840', tamPng(r.f).join() === '2160,3840', tamPng(r.f).join() + ' ' + r.nome);
  r = await exportar('Feed do Instagram', 'efeed.png'); ok('Feed 1080×1350', tamPng(r.f).join() === '1080,1350' && r.nome === 'Ofertas Semana - feed.png', r.nome);
  r = await exportar('Só os produtos', 'etransp.png');
  const alfa = await p.evaluate(async (b64) => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode();
    const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0);
    return [x.getImageData(5, 5, 1, 1).data[3], x.getImageData(5, 1900, 1, 1).data[3]]; }, fs.readFileSync(r.f).toString('base64'));
  ok('transparente: sem fundo nem rodapé', alfa[0] === 0 && alfa[1] === 0, alfa.join());
  // só um produto: selecionar no encarte
  const cx = await p.locator('.palco').boundingBox();
  await p.mouse.click(cx.x + cx.width * 0.25, cx.y + cx.height * 0.45);
  r = await exportar('Só o produto selecionado', 'eprod.png');
  const [pw, ph] = tamPng(r.f);
  ok('só o produto, em 2x', r.nome === 'Ofertas Semana - Arroz.png' && pw > 800 && pw < 1200, `${r.nome} ${pw}×${ph}`);
  // modelo
  r = await exportar('Salvar modelo', 'modelo.json');
  const modelo = JSON.parse(fs.readFileSync(r.f, 'utf8'));
  ok('modelo salvo com o tema', modelo.encartaai_modelo === 1 && modelo.tema.grade === '4', JSON.stringify(modelo.tema).slice(0, 200));
  await p.goto(B + '/encarte/' + id2); await p.waitForSelector('.palco canvas');
  await p.click('button[aria-label="Mais formatos"]');
  await p.setInputFiles('input[aria-label="Importar modelo"]', r.f);
  await salvo();
  t = await tema(id2);
  ok('modelo aplicado em outra campanha', t.grade === '4' && t.escala_preco === 0.95, JSON.stringify([t.grade, t.escala_preco]));
  ok('sem erros de JavaScript', erros.length === 0, erros.join(' | '));
  console.log(passos.join('\n') + '\n\n' + passos.filter((x) => x.startsWith('PASS')).length + '/' + passos.length);
  await b.close();
})().catch((e) => { console.log(passos.join('\n')); console.log('ERRO:', e.message.split('\n')[0]); process.exit(1); });
