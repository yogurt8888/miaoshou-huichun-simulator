const { chromium } = require('playwright-core');
const URL = 'file:///' + process.env.TEMP.replace(/\\/g, '/') + '/峡谷画盘_build/index.html';
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

  // 1) 副标题
  const sub = await page.evaluate(() => document.querySelector('.brand .sub').textContent);
  console.log('1 副标题:', sub, sub === '作者：酸奶很忙o' ? 'OK' : 'FAIL');

  // 2) 彩蛋：连点师姐 3 下
  await page.click('#shijie'); await page.waitForTimeout(120);
  await page.click('#shijie'); await page.waitForTimeout(120);
  await page.click('#shijie');
  await page.waitForTimeout(400);
  const egg = await page.evaluate(() => ({
    overlay: document.getElementById('overlay').classList.contains('show'),
    title: document.getElementById('ovtitle').textContent,
    sub: document.getElementById('ovsub').textContent.replace(/\s+/g, ''),
  }));
  console.log('2 彩蛋引导:', JSON.stringify(egg), egg.overlay && egg.title.includes('最优解') ? 'OK' : 'FAIL');
  await page.screenshot({ path: process.env.TEMP + '/峡谷画盘_build/_qa/9_egg.png' });
  // 关闭后格子闪光
  await page.click('#ovbtns .btn');
  await page.waitForTimeout(300);
  const flash = await page.evaluate(() => document.querySelectorAll('.cell.guideflash').length);
  console.log('  闪光格:', flash, flash === 1 ? 'OK' : 'FAIL');

  // 3) 端到端验证内嵌最优解（修炼 1/3/10/25 按 seq 重放必须恰好通关）
  for (const lv of [0, 2, 9, 24]) {
    await page.evaluate(i => window.__game.jump(i), lv);
    await page.waitForTimeout(250);
    const L = await page.evaluate(() => window.__game.curLevel);
    const cell = (L.tap[0] - 1) * 9 + (L.tap[1] - 1);
    for (const ch of L.seq) {
      await page.evaluate(m => { window.__game.setBrush(m.c); window.__game.tap(m.cell); }, { c: CIDX[ch], cell });
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(2200);
    const r = await page.evaluate(() => ({
      over: window.__game.over,
      overlay: document.getElementById('overlay').classList.contains('show'),
      title: document.getElementById('ovtitle').textContent,
      steps: window.__game.stepsLeft, budget: window.__game.budget,
    }));
    const exact = r.over && r.overlay && (r.steps === r.budget - L.seq.length);
    console.log(`3 修炼-${lv + 1} 按最优解重放:`, JSON.stringify(r), exact ? 'OK' : 'FAIL');
    await page.evaluate(() => { const b = document.querySelector('#ovbtns .btn'); if (b) b.click(); });
    await page.waitForTimeout(300);
  }

  // 4) 世界-1 按 seq 重放 1 步通关
  await page.evaluate(() => window.__game.toWorld());
  await page.waitForTimeout(300);
  const WL = await page.evaluate(() => window.__game.curLevel);
  const wcell = (WL.tap[0] - 1) * 9 + (WL.tap[1] - 1);
  await page.evaluate(m => { window.__game.setBrush(m.c); window.__game.tap(m.cell); }, { c: CIDX[WL.seq[0]], cell: wcell });
  await page.waitForTimeout(2200);
  const w1 = await page.evaluate(() => ({ overlay: document.getElementById('overlay').classList.contains('show') }));
  console.log('4 世界-1 重放:', JSON.stringify(w1), w1.overlay ? 'OK' : 'FAIL');

  console.log('控制台错误数:', errors.length);
  errors.slice(0, 5).forEach(e => console.log('  ERR:', e.slice(0, 160)));
  await browser.close();
})().catch(e => { console.error('QA 失败:', e.message); process.exit(1); });
