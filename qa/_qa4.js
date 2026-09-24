const { chromium } = require('playwright-core');
const fs = require('fs');
const URL = 'file:///' + process.env.TEMP.replace(/\\/g, '/') + '/峡谷画盘_build/index.html';
const OUT = process.env.TEMP + '/峡谷画盘_build/_qa';
fs.mkdirSync(OUT, { recursive: true });

const NB = i => { const r = (i / 9) | 0, c = i % 9, o = [];
  if (c > 0) o.push(i - 1); if (c < 8) o.push(i + 1);
  if (r > 0) o.push(i - 9); if (r < 6) o.push(i + 9); return o; };
function comps(b) {
  const fl = seed => { const col = b[seed], seen = new Set([seed]), st = [seed], reg = [];
    while (st.length) { const i = st.pop(); reg.push(i);
      for (const j of NB(i)) if (!seen.has(j) && b[j] === col) { seen.add(j); st.push(j); } } return reg; };
  const seenAll = new Set(); let n = 0;
  for (let i = 0; i < 63; i++) if (!seenAll.has(i)) { fl(i).forEach(x => seenAll.add(x)); n++; }
  return n;
}
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

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => document.getElementById('tutskip').click());

  // 1) 难度分布：第 1~8 关的连通区/预算/富余
  console.log('== 修炼难度分布 ==');
  for (let r = 1; r <= 8; r++) {
    const st = await page.evaluate(() => ({ round: window.__game.round, comps: window.__game.comps, budget: window.__game.budget, ref: window.__game.solve() }));
    const slack = st.budget - st.ref;
    let expect = r <= 2 ? (st.comps >= 5 && st.comps <= 7 && slack === 2)
      : r <= 5 ? (st.comps >= 9 && st.comps <= 12 && slack === 0)
      : (st.comps >= 12 && st.comps <= 15 && slack === 0);
    console.log(`  第${st.round}关: 连通区 ${st.comps}  预算 ${st.budget}  估步 ${st.ref}  富余 ${slack}  ${expect ? 'OK' : 'FAIL'}`);
    if (r < 8) { await page.evaluate(() => window.__game.advance()); await page.waitForTimeout(150); }
  }

  // 2) 任务卡边框/【】同色 + 剩余步数左对齐
  const ui = await page.evaluate(() => {
    const t = window.__game.target;
    const cs = getComputedStyle(document.getElementById('quest'));
    const gw = getComputedStyle(document.getElementById('goalwrap'));
    const sl = getComputedStyle(document.getElementById('stepsline'));
    return { target: t, border: cs.borderColor, goal: gw.color, align: sl.textAlign };
  });
  const COLMAP = ['rgb(217, 83, 79)', 'rgb(217, 165, 32)', 'rgb(74, 144, 217)', 'rgb(63, 166, 90)'];
  const want = COLMAP[ui.target];
  console.log('== 任务卡 ==', JSON.stringify(ui));
  console.log('  边框随目标色:', ui.border === want ? 'OK' : 'FAIL', '| 【】同色:', ui.goal === want ? 'OK' : 'FAIL', '| 左对齐:', ui.align === 'left' ? 'OK' : 'FAIL');

  // 3) 背景图
  const bg = await page.evaluate(() => getComputedStyle(document.getElementById('bg')).backgroundImage.slice(0, 40));
  console.log('== 背景 ==', bg.includes('data:image/jpeg') ? 'OK(内嵌jpg)' : 'FAIL: ' + bg);
  await page.screenshot({ path: OUT + '/5_bg.png' });

  // 4) 回归：碎棋盘上通关链路 + 失败 + 世界模式
  let won = false;
  for (let g = 0; g < 30; g++) {
    const st = await page.evaluate(() => ({ b: window.__game.board, t: window.__game.target, o: window.__game.over }));
    if (st.o) { won = true; break; }
    const mv = bestMove(st.b, st.t);
    await page.evaluate(m => { window.__game.setBrush(m.brush); window.__game.tap(m.cell); }, mv);
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(2200);
  const w = await page.evaluate(() => ({ title: document.getElementById('ovtitle').textContent, overlay: document.getElementById('overlay').classList.contains('show') }));
  console.log('== 第8关通关 ==', JSON.stringify(w), won && w.overlay ? 'OK' : '(未能赢——碎棋盘难度生效，检查是否估步内)');
  await page.screenshot({ path: OUT + '/6_round8.png' });

  // 先关掉胜利遮罩再切模式
  await page.click('#ovbtns .btn');
  await page.waitForTimeout(400);
  await page.click('#btnMode');
  await page.waitForTimeout(400);
  const wm = await page.evaluate(() => ({ mode: window.__game.mode, lv: document.getElementById('questlv').textContent }));
  console.log('== 世界模式 ==', JSON.stringify(wm), wm.mode === 'world' ? 'OK' : 'FAIL');

  console.log('控制台错误数:', errors.length);
  errors.slice(0, 5).forEach(e => console.log('  ERR:', e.slice(0, 160)));
  await browser.close();
})().catch(e => { console.error('QA 失败:', e.message); process.exit(1); });
