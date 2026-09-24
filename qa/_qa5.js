const { chromium } = require('playwright-core');
const fs = require('fs');
const URL = 'file:///' + process.env.TEMP.replace(/\\/g, '/') + '/峡谷画盘_build/index.html';
const OUT = process.env.TEMP + '/峡谷画盘_build/_qa';
fs.mkdirSync(OUT, { recursive: true });

const NB = i => { const r = (i / 9) | 0, c = i % 9, o = [];
  if (c > 0) o.push(i - 1); if (c < 8) o.push(i + 1);
  if (r > 0) o.push(i - 9); if (r < 6) o.push(i + 9); return o; };
function bestMove(b, target) {
  const fl = seed => { const col = b[seed], seen = new Set([seed]), st = [seed], reg = [];
    while (st.length) { const i = st.pop(); reg.push(i);
      for (const j of NB(i)) if (!seen.has(j) && b[j] === col) { seen.add(j); st.push(j); } } return reg; };
  const seenAll = new Set(), cs = [];
  for (let i = 0; i < 63; i++) if (!seenAll.has(i)) { const r = fl(i); r.forEach(x => seenAll.add(x)); cs.push({ cells: r, color: b[i] }); }
  cs.sort((a, b2) => b2.cells.length - a.cells.length);
  const region = cs[0].cells, col = cs[0].color;
  let bestGain = -1, bestC = col;
  for (let c = 0; c < 4; c++) { if (c === col) continue;
    const seen = new Set(region), st = [];
    for (const i of region) for (const j of NB(i)) if (!seen.has(j) && b[j] === c) { seen.add(j); st.push(j); }
    while (st.length) { const x = st.pop();
      for (const j of NB(x)) if (!seen.has(j) && b[j] === c) { seen.add(j); st.push(j); } }
    if (seen.size - region.length > bestGain) { bestGain = seen.size - region.length; bestC = c; } }
  if (region.length >= 63) bestC = target;
  return { brush: bestC, cell: region[0] };
}
async function autoWin(page) {
  for (let g = 0; g < 30; g++) {
    const st = await page.evaluate(() => ({ b: window.__game.board, t: window.__game.target, o: window.__game.over }));
    if (st.o) return true;
    const mv = bestMove(st.b, st.t);
    await page.evaluate(m => { window.__game.setBrush(m.brush); window.__game.tap(m.cell); }, mv);
    await page.waitForTimeout(70);
  }
  return false;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => document.getElementById('tutskip').click());

  // 1) 文案与面板
  const ui = await page.evaluate(() => ({
    lv: document.getElementById('questlv').textContent,
    modeBtn: document.getElementById('modelabel').textContent,
    lpMode: document.getElementById('lp-mode').textContent,
    lpCount: document.getElementById('lp-count').textContent,
    chips: document.querySelectorAll('.chip').length,
  }));
  console.log('1 初始:', JSON.stringify(ui),
    ui.lv === '修炼-1' && ui.modeBtn === '世界模式' && ui.lpMode === '修炼模式' && ui.chips === 30 ? 'OK' : 'FAIL');

  // 2) 固定性：刷新后棋盘一致
  const b1 = await page.evaluate(() => window.__game.board.join(''));
  await page.reload();
  await page.waitForTimeout(900);
  await page.evaluate(() => { if (window.__game.tutOpen) document.getElementById('tutskip').click(); });
  const b2 = await page.evaluate(() => window.__game.board.join(''));
  console.log('2 固定关卡(刷新一致):', b1 === b2 ? 'OK' : 'FAIL');

  // 3) 选关跳转：修炼-8
  await page.evaluate(() => window.__game.jump(7));
  await page.waitForTimeout(300);
  const j = await page.evaluate(() => ({
    lv: document.getElementById('questlv').textContent,
    cur: document.querySelector('.chip.cur') ? document.querySelector('.chip.cur').textContent : null,
    saved: localStorage.getItem('mshc_tr'),
  }));
  console.log('3 选关修炼-8:', JSON.stringify(j), j.lv === '修炼-8' && j.cur === '8' && j.saved === '8' ? 'OK' : 'FAIL');
  await page.screenshot({ path: OUT + '/7_levelpanel.png' });

  // 4) 进度记忆：刷新后仍是修炼-8
  await page.reload();
  await page.waitForTimeout(900);
  await page.evaluate(() => { if (window.__game.tutOpen) document.getElementById('tutskip').click(); });
  const r8 = await page.evaluate(() => document.getElementById('questlv').textContent);
  console.log('4 进度记忆:', r8, r8 === '修炼-8' ? 'OK' : 'FAIL');

  // 5) 通关修炼-1 → 已通关标记
  await page.evaluate(() => window.__game.jump(0));
  await page.waitForTimeout(300);
  const won = await autoWin(page);
  await page.waitForTimeout(2200);
  const w = await page.evaluate(() => ({
    overlay: document.getElementById('overlay').classList.contains('show'),
    cleared: window.__game.clearedT,
  }));
  console.log('5 通关标记:', JSON.stringify(w), won && w.overlay && w.cleared >= 1 ? 'OK' : 'FAIL');
  await page.click('#ovbtns .btn');
  await page.waitForTimeout(400);
  const lv2 = await page.evaluate(() => document.getElementById('questlv').textContent);
  console.log('  下一关:', lv2, lv2 === '修炼-2' ? 'OK' : 'FAIL');

  // 6) 世界模式面板
  await page.click('#btnMode');
  await page.waitForTimeout(400);
  const wm = await page.evaluate(() => ({
    lv: document.getElementById('questlv').textContent,
    modeBtn: document.getElementById('modelabel').textContent,
    lpMode: document.getElementById('lp-mode').textContent,
    chips: document.querySelectorAll('.chip').length,
  }));
  console.log('6 世界模式:', JSON.stringify(wm),
    wm.lv === '画盘-1' && wm.modeBtn === '修炼模式' && wm.lpMode === '世界模式' && wm.chips === 13 ? 'OK' : 'FAIL');
  await page.screenshot({ path: OUT + '/8_worldpanel.png' });

  // 7) 修炼-30 完成态
  await page.click('#btnMode');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__game.jump(29));
  await page.waitForTimeout(300);
  const lv30 = await page.evaluate(() => document.getElementById('questlv').textContent);
  const won30 = await autoWin(page);
  await page.waitForTimeout(2200);
  const fin = await page.evaluate(() => ({ title: document.getElementById('ovtitle').textContent, overlay: document.getElementById('overlay').classList.contains('show') }));
  console.log('7 修炼-30:', lv30, JSON.stringify(fin), won30 && fin.title === '修炼大成' ? 'OK' : 'FAIL');

  console.log('控制台错误数:', errors.length);
  errors.slice(0, 5).forEach(e => console.log('  ERR:', e.slice(0, 160)));
  await browser.close();
})().catch(e => { console.error('QA 失败:', e.message); process.exit(1); });
