const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
// Parte 4C: camadas, imagens soltas, arrastar no encarte, duplicar foto, logo.
const B = process.env.BASE || 'http://127.0.0.1:8787', N = String(Date.now() % 100000);
const passos = []; const ok = (n, c, x = '') => passos.push((c ? 'PASS ' : 'FALHA ') + n + (x ? '  → ' + x : ''));
const IMG = path.join(__dirname, 'imagens');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
  const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(B + '/entrar');
  const bytes = (f) => Array.from(fs.readFileSync(path.join(IMG, f)));
  const id = await p.evaluate(async ({ N, arroz, selo, logo }) => {
    const j = (m, u, d) => fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(d ?? {}) }).then((r) => r.json());
    const up = (q, b) => fetch('/api/assets/arquivo?' + q, { method: 'POST', headers: { 'content-type': 'image/png' }, body: new Uint8Array(b) }).then((r) => r.json());
    await j('POST', '/api/auth/entrar', { email: 'daniel@incomunicacao.com.br', senha: 'senha-super-123' });
    await j('POST', '/api/admin/clientes', { nome: 'Mercado 4C ' + N, slug: 'm4c-' + N, plano_id: 'completo', dono: { email: `m4c${N}@x.test`, nome: 'Dona', senha: 'senha-dono-123' } });
    await j('POST', '/api/auth/sair');
    await j('POST', '/api/auth/entrar', { email: `m4c${N}@x.test`, senha: 'senha-dono-123' });
    const f = await up('tipo=produto&nome=arroz', arroz);
    await up('tipo=selo&nome=selo-oferta', selo);
    const lg = await up('tipo=logo&nome=logo-loja', logo);
    const l = await j('POST', '/api/lojas', { nome: 'Loja 1 - Rio de Janeiro' });
    await j('PUT', '/api/lojas/' + l.id, { logo_asset_id: lg.id });
    const c = await j('POST', '/api/campanhas', { nome: 'Camadas' });
    await j('PUT', '/api/campanhas/' + c.id, { loja_id: l.id, tema: { grade: '4' }, itens: [{ nome: 'Arroz', preco: '24,90', foto_id: f.id }, { nome: 'Feijão', preco: '7,49' }] });
    return c.id;
  }, { N, arroz: bytes('arroz.png'), selo: bytes('queijo.png'), logo: bytes('logo cascatinha.png') });
  await p.goto(B + '/encarte/' + id);
  await p.waitForSelector('.palco canvas'); await p.waitForTimeout(800);
  const tema = () => p.evaluate(async (id) => (await (await fetch('/api/campanhas/' + id)).json()).campanha.tema, id);
  const salvo = async () => { await p.waitForSelector('text=Salvo às', { timeout: 10000 }); await p.waitForTimeout(1400); };
  const caixa = await p.locator('.palco').boundingBox();
  const em = (fx, fy) => ({ x: caixa.x + caixa.width * fx, y: caixa.y + caixa.height * fy });

  // clicar no produto 1 seleciona e abre ajustes
  let q = em(0.25, 0.42); await p.mouse.click(q.x, q.y);
  await p.waitForSelector('.ajustes');
  ok('clicar no produto no encarte abre os ajustes dele', (await p.locator('.ajustes strong').first().textContent()).includes('Arroz'));
  // arrastar a foto do produto
  await p.mouse.move(q.x, q.y); await p.mouse.down(); await p.mouse.move(q.x + 30, q.y + 10, { steps: 5 }); await p.mouse.up();
  await salvo();
  let fa = (await p.evaluate(async (id) => (await (await fetch('/api/campanhas/' + id)).json()).campanha.itens[0].foto_ajuste, id));
  ok('arrastar no encarte move a foto do produto', fa && fa.dx > 0.02, JSON.stringify(fa));
  // duplicar foto
  await p.click('button:has-text("Duplicar foto")');
  await salvo();
  let t = await tema();
  ok('duplicar foto cria camada presa ao produto 1', t.camadas.length === 1 && t.camadas[0].ancora === 0);
  // imagem solta
  await p.click('button[role=tab]:has-text("Camadas e logo")');
  await p.click('button:has-text("+ Imagem solta")');
  await p.click('.modal .miniatura');
  await p.waitForSelector('.selecao');
  ok('imagem solta adicionada e selecionada no encarte', (await p.locator('.lista-camadas li').count()) === 2);
  // arrastar a seleção
  const s1 = await p.locator('.selecao').boundingBox();
  const c0 = { x: s1.x + s1.width / 2, y: s1.y + s1.height / 2 };
  await p.mouse.move(c0.x, c0.y); await p.mouse.down(); await p.mouse.move(c0.x - 80, c0.y + 60, { steps: 6 }); await p.mouse.up();
  // redimensionar pelo canto
  const s2 = await p.locator('.selecao').boundingBox();
  await p.mouse.move(s2.x + s2.width, s2.y + s2.height); await p.mouse.down(); await p.mouse.move(s2.x + s2.width + 60, s2.y + s2.height + 60, { steps: 6 }); await p.mouse.up();
  // girar
  await p.click('button[aria-label="Girar à direita"]'); await p.click('button[aria-label="Girar à direita"]');
  await salvo();
  t = await tema();
  const solta = t.camadas.find((c) => c.ancora == null);
  ok('mover, aumentar e girar salvos', solta.x < 0.45 && solta.y > 0.47 && solta.w > 0.26 && solta.rot === 30, JSON.stringify(solta));
  // atrás / frente e nível
  await p.click('text=Atrás dos produtos');
  await p.locator('.lista-camadas li').nth(1).locator('button[aria-label="Subir 1 nível"]').click();
  await salvo();
  t = await tema();
  ok('atrás dos produtos e ordem de camadas', t.camadas[1].ancora === 0 && t.camadas[0].atras === true, JSON.stringify(t.camadas.map((c) => [c.ancora, c.atras])));
  await p.screenshot({ path: path.join(os.tmpdir(), 'camadas4c_meio.png') });
  // teclado: apagar
  await p.locator('.lista-camadas li', { hasText: 'atrás dos produtos' }).click();
  await p.keyboard.press('Delete');
  await salvo();
  ok('Delete apaga a camada selecionada', (await tema()).camadas.length === 1);
  // logo
  for (let i = 0; i < 3; i++) await p.click('button[aria-label="Aumentar logo"]');
  await p.click('button[aria-label="Logo para baixo"]');
  await salvo();
  t = await tema();
  ok('logo aumentada e movida', t.logo && t.logo.escala === 1.3 && t.logo.dy > 0, JSON.stringify(t.logo));
  // apagar o produto 1 leva junto a foto extra dele
  await p.click('button[role=tab]:has-text("Produtos")');
  await p.locator('.tabela-itens button[aria-label=Remover]').first().click();
  await salvo();
  ok('remover o produto remove a foto extra dele', (await tema()).camadas.length === 0);
  await p.screenshot({ path: path.join(os.tmpdir(), 'camadas4c.png') });
  ok('sem erros de JavaScript', erros.length === 0, erros.join(' | '));
  console.log(passos.join('\n') + '\n\n' + passos.filter((x) => x.startsWith('PASS')).length + '/' + passos.length);
  await b.close();
})().catch((e) => { console.log(passos.join('\n')); console.log('ERRO:', e.message.split('\n')[0]); process.exit(1); });
