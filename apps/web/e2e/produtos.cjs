const { chromium } = require('playwright');
const path = require('path'), os = require('os');
// Parte 4A: planilha de produtos, foto enviada na hora e ajustes por produto.
// Precisa: wrangler dev com super admin local e e2e/imagens/{produtos.xlsx, queijo.png, arroz.png}.
const B = process.env.BASE || 'http://127.0.0.1:8787', N = String(Date.now() % 100000);
const IMG = path.join(__dirname, 'imagens');
const passos = []; const ok = (n, c, x = '') => passos.push((c ? 'PASS ' : 'FALHA ') + n + (x ? '  → ' + x : ''));
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(B + '/entrar');
  await p.evaluate(async ({ N }) => {
    const j = (u, d) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d ?? {}) });
    await j('/api/auth/entrar', { email: 'daniel@incomunicacao.com.br', senha: 'senha-super-123' });
    await j('/api/admin/clientes', { nome: 'Mercado 4A ' + N, slug: 'm4a-' + N, plano_id: 'completo', dono: { email: `m4a${N}@x.test`, nome: 'Dona', senha: 'senha-dono-123' } });
    await j('/api/auth/sair');
    await j('/api/auth/entrar', { email: `m4a${N}@x.test`, senha: 'senha-dono-123' });
  }, { N });
  await p.goto(B + '/produtos');
  // ── planilha
  await p.click('button:has-text("Importar planilha")');
  await p.setInputFiles('input[aria-label=Planilha]', path.join(IMG, 'produtos.xlsx'));
  await p.waitForSelector('.tabela-planilha');
  const cols = await p.$$eval('.tabela-planilha th select', (s) => s.map((x) => x.value));
  ok('colunas reconhecidas pelo título', JSON.stringify(cols) === '["ean","nome","descricao","categoria"]', JSON.stringify(cols));
  await p.click('.modal button:has-text("Importar 4 produtos")');
  await p.waitForSelector('.modal >> text=produtos novos');
  ok('4 produtos criados', (await p.locator('.modal p').first().textContent()).includes('4 produtos novos'));
  await p.click('.modal button:has-text("Pronto")');
  await p.waitForSelector('td:has-text("0078742351919")');
  ok('EAN com zero na frente preservado', true);
  // de novo: atualiza, não duplica
  await p.click('button:has-text("Importar planilha")');
  await p.setInputFiles('input[aria-label=Planilha]', path.join(IMG, 'produtos.xlsx'));
  await p.click('.modal button:has-text("Importar 4 produtos")');
  await p.waitForSelector('.modal >> text=atualizados');
  { const t = await p.locator('.modal p').first().textContent(); ok('reimportar atualiza pelo EAN', /0 produtos novos.*3 atualizados.*1 já existiam/.test(t), t); }
  await p.click('.modal button:has-text("Pronto")');
  // ── campanha, foto na hora
  await p.click('nav a:has-text("Encarte")');
  await p.click('button:has-text("Nova campanha")'); await p.fill('.modal input', 'Teste 4A'); await p.click('.modal button:has-text("Criar")');
  await p.waitForSelector('canvas[aria-label="Prévia do encarte"]');
  await p.selectOption('label:has-text("Grade") select', '4');
  await p.click('button:has-text("+ Produto")');
  await p.fill('.tabela-itens input[aria-label=Nome]', 'Queijo Prato');
  await p.fill('.tabela-itens input[aria-label=Preço]', '4,99');
  await p.click('.tabela-itens .miniatura-botao');
  await p.setInputFiles('input[aria-label="Enviar foto do computador"]', path.join(IMG, 'queijo.png'));
  await p.waitForSelector('.tabela-itens .miniatura-botao img', { timeout: 10000 });
  ok('foto enviada na hora entra no produto', true);
  await p.waitForSelector('text=Salvo às', { timeout: 10000 });
  const prod = await p.evaluate(async () => (await (await fetch('/api/produtos?q=Queijo')).json()).produtos);
  ok('virou produto do banco com foto (próxima campanha acha sozinha)', prod.length === 1 && !!prod[0].foto_id, JSON.stringify(prod));
  // ── ajustes
  await p.click('button[aria-label=Ajustar]');
  await p.waitForSelector('.ajustes');
  const antes = await p.locator('canvas[aria-label="Prévia do encarte"]').screenshot();
  for (let i = 0; i < 3; i++) await p.click('button[aria-label="Diminuir foto"]');
  await p.click('button[aria-label="Foto para a direita"]');
  ok('zoom da foto mostra 70%', (await p.locator('.ajustes .valor').first().textContent()) === '70%');
  await p.click('text=Fora do app + Leve N por');
  await p.fill('input[aria-label="Preço fora do app"]', '6,49');
  await p.fill('input[aria-label="Quantidade"]', '2');
  await p.fill('input[aria-label="Preço do combo"]', '9,00');
  ok('unitário automático 4,50', (await p.getAttribute('input[aria-label="Preço unitário"]', 'placeholder')) === '4,50');
  await p.waitForTimeout(800);
  const depois = await p.locator('canvas[aria-label="Prévia do encarte"]').screenshot();
  ok('prévia mudou com os ajustes', Buffer.compare(antes, depois) !== 0);
  await p.screenshot({ path: path.join(os.tmpdir(), 'ajustes4a.png'), fullPage: true });
  await p.click('button[aria-label=Ocultar]');
  await p.waitForSelector('text=Salvo às', { timeout: 10000 }); await p.waitForTimeout(1500);
  await p.reload(); await p.waitForSelector('.tabela-itens tbody tr');
  const it = await p.evaluate(async () => { const l = await (await fetch('/api/campanhas')).json(); return (await (await fetch('/api/campanhas/' + l.campanhas[0].id)).json()).campanha.itens[0]; });
  ok('ajustes salvos', it.oculto === true && it.foto_ajuste.escala === 0.7 && it.combo.qtd === 2 && it.combo.preco === '9,00', JSON.stringify(it));
  ok('linha oculta aparece apagada', await p.locator('.tabela-itens tr.oculto').count() === 1);
  await p.screenshot({ path: path.join(os.tmpdir(), 'editor4a.png') });
  ok('sem erros de JavaScript', erros.length === 0, erros.join(' | '));
  console.log(passos.join('\n') + '\n\n' + passos.filter((x) => x.startsWith('PASS')).length + '/' + passos.length);
  await b.close();
})().catch((e) => { console.log(passos.join('\n')); console.log('ERRO:', e.message.split('\n')[0]); process.exit(1); });
