const { chromium } = require('playwright');
const fs = require('fs');
// Precisa: wrangler dev com super admin daniel@incomunicacao.com.br / senha-super-123 (local),
// e em e2e/imagens: as fotos de teste, logo-loja.webp, um fundo .jpg e fontes .ttf (não versionadas).
process.chdir(require('path').join(__dirname, 'imagens'));
const B = process.env.BASE || 'http://127.0.0.1:8787', N = String(Date.now() % 100000);
const passos = []; const ok = (n, c, x = '') => passos.push((c ? 'PASS ' : 'FALHA ') + n + (x ? '  → ' + x : ''));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  // cliente novo pela API, como super admin
  await p.goto(B + '/entrar');
  const st = await p.evaluate(async ({ N }) => {
    const j = (u, d) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) });
    const a = await j('/api/auth/entrar', { email: 'daniel@incomunicacao.com.br', senha: 'senha-super-123' });
    const r = await j('/api/admin/clientes', { nome: 'Mercado Teste ' + N, slug: 'mercado-' + N, plano_id: 'completo',
      dono: { email: `dono${N}@mercado.test`, nome: 'Dona Teste', senha: 'senha-dono-123' } });
    await j('/api/auth/sair', {});
    return [a.status, r.status];
  }, { N });
  ok('cliente criado', st[1] === 201, String(st));
  // dono pela tela
  await p.goto(B + '/entrar');
  await p.fill('input[type=email]', `dono${N}@mercado.test`); await p.fill('input[type=password]', 'senha-dono-123');
  await p.click('button:has-text("Entrar")'); await p.waitForSelector('h1:has-text("Olá")');
  // banco: fotos, logo, fundo e fontes
  await p.click('a:has-text("Banco de imagens")');
  await p.setInputFiles('input[type=file]', ['arroz.png', 'feijao.png', 'refrigerante 7894900027013.png', 'queijo.png', 'oleo.png', 'cafe.png']);
  await p.waitForSelector('text=6 de 6 enviado(s)', { timeout: 20000 });
  await p.click('button[role=tab]:has-text("Logos")'); await p.setInputFiles('input[type=file]', ['logo-loja.webp']); await p.waitForSelector('text=1 de 1 enviado(s)');
  await p.click('button[role=tab]:has-text("Temas")'); await p.setInputFiles('input[type=file]', ['fundo-oferta-relampago.jpg']); await p.waitForSelector('text=1 de 1 enviado(s)');
  await p.click('button[role=tab]:has-text("Fontes")'); await p.setInputFiles('input[type=file]', ['GothamUltra.ttf', 'GothamCondMediumItalic.ttf', 'GothamBookItalic.ttf']);
  await p.waitForSelector('text=3 de 3 enviado(s)', { timeout: 20000 });
  ok('banco recebeu fotos, logo, tema e fontes', true);
  // loja com logo
  await p.click('a:has-text("Lojas")');
  await p.fill('input[placeholder^="Nome da loja"]', 'Loja 1 - Rio de Janeiro'); await p.click('button:has-text("Adicionar")');
  await p.click('button:has-text("Escolher logo")'); await p.click('.modal .miniatura');
  await p.waitForSelector('img[alt="Logo Loja 1 - Rio de Janeiro"]');
  ok('loja com logo', true);
  // kit com as fontes enviadas
  await p.click('a:has-text("Kit da marca")'); await p.waitForSelector('.previa-caixa');
  const fonteCampo = async (rotulo, nome) => {
    const sel = p.locator('.cartao:has(h2:text("Fontes")) label', { hasText: new RegExp('^' + rotulo) }).locator('select');
    const val = await sel.locator('option', { hasText: nome }).first().getAttribute('value'); await sel.selectOption(val);
  };
  await fonteCampo('Nome do produto', 'GothamCondMediumItalic'); await fonteCampo('Descrição', 'GothamBookItalic'); await fonteCampo('Preço', 'GothamUltra');
  await p.click('button:has-text("Salvar kit")'); await p.waitForSelector('text=Kit da marca salvo');
  ok('kit salvo com fontes do banco', true);
  // campanha
  await p.click('nav a:has-text("Encarte")');
  await p.click('button:has-text("Nova campanha")'); await p.fill('.modal input', 'Ofertas de sexta'); await p.click('.modal button:has-text("Criar")');
  await p.waitForSelector('canvas[aria-label="Prévia do encarte"]');
  ok('editor abre a campanha nova', true);
  await p.selectOption('label:has-text("Loja") select', { label: 'Loja 1 - Rio de Janeiro' });
  await p.selectOption('label:has-text("Fundo / tema") select', { label: 'fundo-oferta-relampago' });
  await p.selectOption('label:has-text("Grade") select', '6');
  await p.click('button:has-text("Colar lista")');
  await p.fill('.modal textarea', 'ARROZ TIPO 1 5KG 24,90\nFEIJÃO CARIOCA 1KG 7,49 UN\nREFRIGERANTE COLA 2L 7894900027013 9,99\nQUEIJO MUÇARELA 3,29 CADA 100G\nÓLEO DE SOJA 900ML 6,98\nCAFÉ TRADICIONAL 500G 18,90\nBISCOITO RECHEADO 2,99');
  ok('lista lida: 7 produtos', await p.locator('.modal button.primario').textContent().then(t => /\(7\)/.test(t)));
  await p.click('.modal button.primario');
  await p.waitForSelector('.tabela-itens tbody tr >> nth=6');
  const fotoEan = await p.locator('.tabela-itens tbody tr').nth(2).locator('img').count();
  ok('produto com EAN já veio com foto do banco', fotoEan === 1);
  ok('preço e fator separados do nome', (await p.locator('.tabela-itens tbody tr').nth(3).locator('input[aria-label=Preço]').inputValue()) === '3,29'
    && (await p.locator('.tabela-itens tbody tr').nth(3).locator('input[aria-label=Fator]').inputValue()) === 'CADA 100G');
  ok('aviso de produto fora da grade', await p.locator('text=ficam de fora').count() === 1);
  // escolher foto manualmente para o primeiro
  await p.locator('.tabela-itens .miniatura-botao').first().click();
  await p.fill('.modal input', 'arroz'); await p.waitForSelector('.modal .miniatura'); await p.click('.modal .miniatura');
  await p.waitForSelector('text=Salvo às', { timeout: 10000 });
  ok('autosave', true);
  await p.waitForTimeout(1500);
  const pintado = await p.locator('canvas[aria-label="Prévia do encarte"]').evaluate(c => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) n++; return n; });
  ok('prévia desenhada (fundo, logo, cards)', pintado > 1000, String(pintado));
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'editor.png') });
  // recarregar mantém
  await p.reload(); await p.waitForSelector('.tabela-itens tbody tr >> nth=6');
  ok('recarregar mantém produtos e grade', (await p.locator('label:has-text("Grade") select').inputValue()) === '6');
  // exportar
  const dl = p.waitForEvent('download');
  await p.click('button:has-text("Exportar PNG")');
  const d = await dl; await d.saveAs(require('path').join(require('os').tmpdir(), 'exportado.png'));
  ok('PNG exportado', d.suggestedFilename() === 'Ofertas de sexta.png', d.suggestedFilename());
  ok('sem erros de JavaScript', erros.length === 0, erros.join(' | '));
  console.log(passos.join('\n') + '\n\n' + passos.filter(x => x.startsWith('PASS')).length + '/' + passos.length);
  await b.close();
})().catch(e => { console.log(passos.join('\n')); console.log('ERRO:', e.message.split('\n')[0]); process.exit(1); });
