const { chromium } = require('playwright-core');
const fs = require('fs');

const URL = 'file:///' + process.env.TEMP.replace(/\\/g, '/') + '/峡谷画盘_build/index.html';
const OUT = process.env.TEMP + '/峡谷画盘_build/_qa';
fs.mkdirSync(OUT, { recursive: true });

const NB = i => { const r = (i / 9) | 0, c = i % 9, o = [];
  if (c > 0) o.push(i - 1); if (c < 9 - 1) o.push(i + 1);
  if (r > 0) o.push(i - 9); if (r < 6) o.push(i + 9); return o; };
function comps(b) {
  const fl = seed => { const col = b[seed], seen = new Set([seed]), st = [seed], reg = [];
    while (st.length) { const i = st.pop(); reg.push(i);
      for (const j of NB(i)) if (!seen.has(j) && b[j] === col) { seen.add(j); st.push(j); } } return reg; };
  const seenAll = new Set(), out = [];
  for (let i = 0; i < 63; i++) if (!seenAll.has(i)) { const r = fl(i); r.forEach(x => seenAll.add(x)); out.push({ cells: r, color: b[i] }); }
  return out;
}
function zeroGainMove(b, target) {
  const cs = comps(b).sort((a, b2) => a.cells.length - b2.cells.length);
  let fallback = null, fbGain = Infinity;
  for (const comp of cs) {
    for (let c = 0; c < 4; c++) {
      if (c === comp.color || c === target) continue;   // 不染目标色 → 永远不可能赢
      const inR = new Set(comp.cells); let absorbed = 0;
      for (const i of comp.cells) for (const j of NB(i)) if (!inR.has(j) && b[j] === c) absorbed++;
      if (absorbed === 0) return { brush: c, cell: comp.cells[0] };
      if (absorbed < fbGain) { fbGain = absorbed; fallback = { brush: c, cell: comp.cells[0] }; }
    }
  }
  return fallback;   // 找不到废步就用最小吞并，仍保证不赢
}
function bestMove(b, target) {
  const cs = comps(b).sort((a, b2) => b2.cells.length - a.cells.length);
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

  // 0) 教程：首次自动弹出 → 逐步走完
  const tut0 = await page.evaluate(() => ({ open: window.__game.tutOpen, txt: window.__game.tutText }));
  console.log('0 教程首启:', JSON.stringify(tut0), tut0.open && tut0.txt.includes('欢迎') ? 'OK' : 'FAIL');
  await page.screenshot({ path: OUT + '/0_tut.png' });
  for (let i = 0; i < 6; i++) await page.click('#tutnext');
  await page.waitForTimeout(300);
  const tut1 = await page.evaluate(() => ({ open: window.__game.tutOpen, flag: localStorage.getItem('mshc_tut') }));
  console.log('0 教程走完:', JSON.stringify(tut1), !tut1.open && tut1.flag === '1' ? 'OK' : 'FAIL');
  // 教程重播按钮
  await page.click('#btnTut');
  await page.waitForTimeout(200);
  const tut2 = await page.evaluate(() => window.__game.tutOpen);
  await page.click('#tutskip');
  console.log('0 教程重播:', tut2 ? 'OK' : 'FAIL');
  await page.waitForTimeout(300);

  // 1) 文案与初始状态
  const t0 = await page.evaluate(() => ({
    lv: document.getElementById('questlv').textContent,
    sub: document.querySelector('.brand .sub').textContent,
    footer: document.querySelector('footer').innerText.replace(/\s+/g, ''),
    steps: window.__game.stepsLeft, budget: window.__game.budget, ref: window.__game.solve(),
    hasYusuan: document.body.innerText.includes('预算'),
  }));
  console.log('1 初始:', JSON.stringify(t0));
  console.log('  副标题:', t0.sub.includes('酸奶很忙（求关注）') ? 'OK' : 'FAIL',
              '| 底部:', t0.footer.includes('kimi-k3模型复刻，师姐立绘采集于网络') ? 'OK' : 'FAIL',
              '| 无预算:', !t0.hasYusuan ? 'OK' : 'FAIL',
              '| 第1关富余2步:', t0.budget === t0.ref + 2 ? 'OK' : 'FAIL');

  // 2) 染色泼溅效果存在
  await page.evaluate(() => { const b = window.__game.board; window.__game.setBrush((b[0] + 1) % 4); window.__game.tap(0); });
  await page.waitForTimeout(120);
  const splashN = await page.evaluate(() => document.querySelectorAll('.splash').length);
  console.log('2 泼溅元素数:', splashN, splashN > 0 ? 'OK' : 'FAIL');
  await page.screenshot({ path: OUT + '/1_splash.png' });
  await page.waitForTimeout(900);

  // 3) 难度：第 3 关起零富余
  await page.evaluate(() => { window.__game.advance(); });
  await page.waitForTimeout(200);
  const r2 = await page.evaluate(() => ({ b: window.__game.budget, s: window.__game.solve() }));
  await page.evaluate(() => { window.__game.advance(); });
  await page.waitForTimeout(200);
  const r3 = await page.evaluate(() => ({ b: window.__game.budget, s: window.__game.solve(), round: window.__game.round }));
  console.log('3 第2关富余:', r2.b - r2.s, r2.b === r2.s + 2 ? 'OK' : 'FAIL',
              '| 第3关富余:', r3.b - r3.s, r3.b === r3.s && r3.round === 3 ? 'OK(零富余)' : 'FAIL');

  // 4) 重置
  const sA = await page.evaluate(() => window.__game.stepsLeft);
  await page.evaluate(() => { const b = window.__game.board; window.__game.setBrush((b[0] + 1) % 4); window.__game.tap(0); });
  await page.click('#btnReset');
  await page.waitForTimeout(300);
  const sB = await page.evaluate(() => window.__game.stepsLeft);
  console.log('4 重置:', sA, '->', sB, sA === sB ? 'OK' : 'FAIL');

  // 5) 连输 3 次触发助力（等结算+重置完成再采样）
  for (let f = 1; f <= 3; f++) {
    let guard = 0;
    while (guard++ < 25) {
      const g = await page.evaluate(() => ({ b: window.__game.board, t: window.__game.target, o: window.__game.over }));
      if (g.o) break;
      const mv = zeroGainMove(g.b, g.t);
      if (!mv) break;
      await page.evaluate(m => { window.__game.setBrush(m.brush); window.__game.tap(m.cell); }, mv);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(1900);
    const st = await page.evaluate(() => ({ fc: window.__game.failCount, assist: window.__game.assistOn, steps: window.__game.stepsLeft, budget: window.__game.budget, over: window.__game.over, overlay: document.getElementById('overlay').classList.contains('show'), toast: document.getElementById('toast').textContent }));
    console.log(`5 失败第${f}次:`, JSON.stringify(st), f < 3 ? (!st.assist ? 'OK' : 'FAIL') : (st.assist && st.steps === st.budget + 2 ? 'OK(+2)' : 'FAIL'), st.overlay ? 'FAIL(遮罩)' : '');
  }

  // 6) 世界模式：13 关在列表 + 1 关通关
  await page.click('#btnMode');
  await page.waitForTimeout(400);
  const w0 = await page.evaluate(() => ({ mode: window.__game.mode, lv: document.getElementById('questlv').textContent, budget: window.__game.budget, assist: window.__game.assistOn }));
  console.log('6 回到世界:', JSON.stringify(w0), w0.mode === 'world' && !w0.assist ? 'OK' : 'FAIL');
  await page.evaluate(() => { window.__game.setBrush(1); const b = window.__game.board; window.__game.tap(b.findIndex(v => v === 0)); });
  await page.waitForTimeout(2200);
  const w1 = await page.evaluate(() => ({ title: document.getElementById('ovtitle').textContent, overlay: document.getElementById('overlay').classList.contains('show') }));
  console.log('6 世界1关通关:', JSON.stringify(w1), w1.overlay ? 'OK' : 'FAIL');
  await page.screenshot({ path: OUT + '/2_world_win.png' });
  // 直接跳到 13 关验证存在
  await page.evaluate(() => { for (let i = 0; i < 12; i++) window.__game.advance(); });
  await page.waitForTimeout(300);
  const w13 = await page.evaluate(() => ({ lv: document.getElementById('questlv').textContent, budget: window.__game.budget, t: window.__game.target }));
  console.log('6 第13关:', JSON.stringify(w13), w13.lv === '画盘-13' && w13.budget === 5 && w13.t === 3 ? 'OK' : 'FAIL');
  await page.screenshot({ path: OUT + '/3_world13.png' });

  // 7) 修炼通关链路
  await page.click('#btnMode');
  await page.waitForTimeout(400);
  let guard = 0;
  while (guard++ < 30) {
    const g = await page.evaluate(() => ({ b: window.__game.board, t: window.__game.target, o: window.__game.over }));
    if (g.o) break;
    const mv = bestMove(g.b, g.t);
    await page.evaluate(m => { window.__game.setBrush(m.brush); window.__game.tap(m.cell); }, mv);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(2200);
  const t1 = await page.evaluate(() => ({ title: document.getElementById('ovtitle').textContent, overlay: document.getElementById('overlay').classList.contains('show') }));
  console.log('7 修炼通关:', JSON.stringify(t1), t1.overlay ? 'OK' : 'FAIL');

  console.log('控制台错误数:', errors.length);
  errors.slice(0, 5).forEach(e => console.log('  ERR:', e.slice(0, 160)));
  await browser.close();
})().catch(e => { console.error('QA 失败:', e.message); process.exit(1); });
