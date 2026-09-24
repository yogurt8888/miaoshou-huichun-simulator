const { chromium } = require('playwright-core');
const fs = require('fs');
const URL = 'file:///' + process.env.TEMP.replace(/\\/g, '/') + '/峡谷画盘_build/index.html';
const OUT = process.env.TEMP + '/峡谷画盘_build/_qa';
fs.mkdirSync(OUT, { recursive: true });
const CIDX = { R: 0, Y: 1, B: 2, G: 3 };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => document.getElementById('tutskip').click());

  // 世界模式：16 关
  await page.evaluate(() => window.__game.toWorld());
  await page.waitForTimeout(400);
  const p = await page.evaluate(() => ({
    chips: document.querySelectorAll('.chip').length,
    lp: document.getElementById('lp-count').textContent,
  }));
  console.log('1 世界面板:', JSON.stringify(p), p.chips === 16 ? 'OK' : 'FAIL');

  // 逐关按图注最优解重放（14/15/16）
  for (const idx of [13, 14, 15]) {
    await page.evaluate(i => window.__game.jump(i), idx);
    await page.waitForTimeout(300);
    const L = await page.evaluate(() => window.__game.curLevel);
    const lvName = await page.evaluate(() => document.getElementById('questlv').textContent);
    const cell = (L.tap[0] - 1) * 9 + (L.tap[1] - 1);
    for (const ch of L.seq) {
      await page.evaluate(m => { window.__game.setBrush(m.c); window.__game.tap(m.cell); }, { c: CIDX[ch], cell });
      await page.waitForTimeout(110);
    }
    await page.waitForTimeout(2300);
    const r = await page.evaluate(() => ({
      overlay: document.getElementById('overlay').classList.contains('show'),
      steps: window.__game.stepsLeft, budget: window.__game.budget,
    }));
    console.log(`2 ${lvName} 按图注解重放:`, JSON.stringify(r), r.overlay && r.steps === 0 ? 'OK' : 'FAIL');
    if (idx === 13) await page.screenshot({ path: OUT + '/11_world14.png' });
    if (idx !== 15) {
      await page.evaluate(() => { const b = document.querySelector('#ovbtns .btn'); if (b) b.click(); });
      await page.waitForTimeout(350);
    }
  }
  // 16 关全清后应出现「16 座画盘」全部通关
  const fin = await page.evaluate(() => ({
    overlay: document.getElementById('overlay').classList.contains('show'),
    sub: document.getElementById('ovsub').textContent,
  }));
  console.log('3 全部通关文案:', JSON.stringify(fin), fin.overlay && fin.sub.includes('16 座画盘') ? 'OK' : 'FAIL');
  await page.screenshot({ path: OUT + '/12_worldfin.png' });

  console.log('控制台错误数:', errors.length);
  errors.slice(0, 5).forEach(e => console.log('  ERR:', e.slice(0, 160)));
  await browser.close();
})().catch(e => { console.error('QA 失败:', e.message); process.exit(1); });
