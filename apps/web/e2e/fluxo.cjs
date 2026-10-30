const { chromium } = require('playwright');
// Roda contra um `wrangler dev` com o super admin criado via POST /api/setup.
// Uso: node apps/web/e2e/fluxo.cjs   (imagens de teste em apps/web/e2e/imagens)
const B = process.env.BASE || 'http://127.0.0.1:8787';
process.chdir(require('path').join(__dirname, 'imagens'));
const N = String(Date.now() % 100000);
const passos = [];
const ok = (n, c, extra='') => passos.push((c ? 'PASS ' : 'FALHA ') + n + (extra ? '  → ' + extra : ''));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 860 } });
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());

  // ── super admin ──
  await p.goto(B + '/');
  await p.waitForURL(/entrar/, { timeout: 5000 }).catch(() => {});
  ok('sem sessão, vai para /entrar', p.url().endsWith('/entrar'), p.url());
  await p.fill('input[type=email]', 'daniel@incomunicacao.com.br');
  await p.fill('input[type=password]', 'errada-123');
  await p.click('button:has-text("Entrar")');
  ok('senha errada mostra o aviso', await p.getByRole('alert').textContent().then(t => /incorretos/.test(t)));
  await p.fill('input[type=password]', 'senha-super-123');
  await p.click('button:has-text("Entrar")');
  await p.waitForSelector('h1:has-text("Clientes")');
  ok('super entra no painel de clientes', true);
  await p.click('button:has-text("Novo cliente")');
  await p.getByLabel('Nome do cliente').fill('Terê Frutas ' + N);
  ok('endereço sugerido a partir do nome', (await p.locator('input[pattern]').inputValue()) === 'tere-frutas-' + N);
  await p.getByLabel('Nome do dono').fill('Gerente Terê');
  await p.getByLabel('E-mail do dono').fill('gerente' + N + '@terefrutas.com.br');
  await p.getByLabel(/Senha inicial/).fill('senha-tere-123');
  await p.click('button:has-text("Criar cliente")');
  await p.waitForSelector('h1:has-text("Terê Frutas ' + N + '")');
  ok('cliente criado e aberto', true);
  await p.getByRole('combobox', { name: 'Módulo Vídeo e LED' }).selectOption('bloqueado');
  await p.waitForTimeout(400);
  const vid = await p.locator('.modulo', { hasText: 'Vídeo e LED' }).locator('.etiqueta').textContent();
  ok('bloquear um módulo desliga na hora', vid === 'desligado', vid);
  await p.getByRole('combobox', { name: 'Módulo Vídeo e LED' }).selectOption('plano');
  await p.screenshot({ path: require("path").join(require("os").tmpdir(), '1-cliente.png'), fullPage: true });
  await p.click('button:has-text("Sair")');

  // ── dono do cliente ──
  await p.waitForURL(/entrar/);
  await p.fill('input[type=email]', 'gerente' + N + '@terefrutas.com.br');
  await p.fill('input[type=password]', 'senha-tere-123');
  await p.click('button:has-text("Entrar")');
  await p.waitForSelector('h1:has-text("Olá")');
  ok('dono entra no início', true);
  await p.click('a:has-text("Banco de imagens")');
  await p.setInputFiles('input[type=file]', ['coca-cola 2l 7894900027013.png', 'arroz tio joao 5kg.png']);
  await p.waitForSelector('text=2 de 2 enviado(s)', { timeout: 15000 });
  await p.waitForSelector('.miniatura img');
  const n = await p.locator('.miniatura').count();
  ok('envio de 2 fotos aparece na galeria', n === 2, String(n));
  const carregou = await p.locator('.miniatura img').first().evaluate(img => img.complete && img.naturalWidth > 0);
  ok('a miniatura carrega do R2', carregou);
  await p.screenshot({ path: require("path").join(require("os").tmpdir(), '2-banco.png'), fullPage: true });

  await p.click('a:has-text("Produtos")');
  await p.waitForSelector('td:has-text("7894900027013")');
  ok('foto com EAN no nome criou o produto', true);
  await p.click('button:has-text("Testar uma lista")');
  await p.fill('textarea', 'COCA COLA 2L 7894900027013\nARROZ TIO JOAO 5KG\npneu aro 13');
  await p.click('button:has-text("Testar")');
  await p.waitForSelector('text=pelo EAN');
  ok('testador: EAN reconhecido', true);
  const tab = await p.locator('.cartao:has(textarea) table').innerText();
  ok('testador: item sem produto marcado', /pneu aro 13\s+sem foto/i.test(tab), JSON.stringify(tab));
  await p.screenshot({ path: require("path").join(require("os").tmpdir(), '3-produtos.png'), fullPage: true });

  await p.click('a:has-text("Kit da marca")');
  await p.locator('.cartao:has(h2:text("Fontes")) label', { hasText: /^Preço/ }).locator('select').selectOption('google:Anton');
  await p.locator('.cores label', { hasText: 'Caixa do preço' }).locator('input').fill('#0057b8');
  await p.locator('textarea').fill('Ofertas válidas enquanto durarem os estoques.');
  await p.click('button:has-text("Salvar kit")');
  await p.waitForSelector('text=Kit da marca salvo');
  await p.reload(); await p.waitForSelector('.previa-caixa');
  const fundo = await p.locator('.previa-caixa .preco').evaluate(e => getComputedStyle(e).backgroundColor);
  ok('kit salvo volta depois de recarregar', fundo === 'rgb(0, 87, 184)', fundo);
  await p.screenshot({ path: require("path").join(require("os").tmpdir(), '4-kit.png'), fullPage: true });

  const bloqueado = await p.locator('a.bloqueado').count();
  ok('menu mostra cadeado só no que não está no plano (Completo: nenhum)', bloqueado === 0, String(bloqueado));

  // ── acesso único ──
  const ctx2 = await b.newContext(); const p2 = await ctx2.newPage();
  await p2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p2.goto(B + '/entrar');
  await p2.fill('input[type=email]', 'gerente' + N + '@terefrutas.com.br');
  await p2.fill('input[type=password]', 'senha-tere-123');
  await p2.click('button:has-text("Entrar")');
  await p2.waitForSelector('h1:has-text("Olá")');
  await p.click('a:has-text("Lojas")');
  await p.waitForSelector('text=Sessão encerrada', { timeout: 8000 }).catch(() => {});
  ok('o primeiro computador recebe "conta aberta em outro computador"', await p.locator('text=aberta em outro computador').count() > 0);
  await p.screenshot({ path: require("path").join(require("os").tmpdir(), '5-sessao.png') });

  ok('sem erros de JavaScript na página', erros.length === 0, erros.join(' | '));
  console.log(passos.join('\n'));
  console.log('\n' + passos.filter(x => x.startsWith('PASS')).length + '/' + passos.length);
  await b.close();
})().catch(e => { console.log(passos.join('\n')); console.log('ERRO:', e.message); process.exit(1); });
