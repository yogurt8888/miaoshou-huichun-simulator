const { chromium } = require('playwright-core');
const fs = require('fs');

const URL = 'file:///' + process.env.TEMP.replace(/\\/g, '/') + '/峡谷画盘_build/index.html';
const OUT = process.env.TEMP + '/峡谷画盘_build/_qa';
fs.mkdirSync(OUT, { recursive: true });

const NB = i => { const r = (i / 9) | 0, c = i % 9, o = [];
  if (c > 0) o.push(i - 1); if (c < 9 - 1) o.push(i + 1);
  if (r > 0) o.push(i - 9); if (r < 6) o.push(i + 9); return o; };

function zeroGainMove(b, target) {
  const fl = seed => { const col = b[seed], seen = new Set([seed]), st = [seed], reg = [];
    while (st.length) { const i = st.pop(); reg.push(i);
      for (const j of NB(i)) if (!seen.has(j) && b[j] === col) { seen.add(j); st.push(j); } } return reg; };
  const seenAll = new Set(), comps = [];
  for (let i = 0; i < 63; i++) if (!seenAll.has(i)) { const r = fl(i); r.forEach(x => seenAll.add(x)); comps.push({ cells: r, color: b[i] }); }
  comps.sort((a, b2) => a.cells.length - b2.cells.length);
  for (const comp of comps) {
    for (let c = 0; c < 4; c++) {
      if (c === comp.color || c === target) continue;
      const inR = new Set(comp.cells); let absorbed = 0;
      for (const i of comp.cells) for (const j of NB(i)) if (!inR.has(j) && b[j] === c) absorbed++;
      if (absorbed === 0) return { brush: c, cell: comp.cells[0] };
    }
  }
  return null;
}

function bestMove(b, target) {
  const fl = seed => { const col = b[seed], seen = new Set([seed]), st = [seed], reg = [];
    while (st.length) { const i = st.pop(); reg.push(i);
      for (const j of NB(i)) if (!seen.has(j) && b[j] === col) { seen.add(j); st.push(j); } } return reg; };
  const seenAll = new Set(), comps = [];
  for (let i = 0; i < 63; i++) if (!seenAll.has(i)) { const r = fl(i); r.forEach(x => seenAll.add(x)); comps.push({ cells: r, color: b[i] }); }
  comps.sort((a, b2) => b2.cells.length - a.cells.length);
  const region = comps[0].cells, col = comps[0].color;
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
  await page.waitForTimeout(700);

  // 1) 初始状态 + 文案检查
  const t0 = await page.evaluate(() => ({
    lv: document.getElementById('questlv').textContent,
    goal: document.getElementById('targetname').textContent,
    steps: window.__game.stepsLeft, budget: window.__game.budget,
    mode: window.__game.mode,
    hasYusuan: document.body.innerText.includes('预算'),
    shijieVisible: (() => { const i = document.getElementById('shijieimg'); return i.complete && i.naturalWidth > 0; })(),
  }));
  console.log('1 初始:', JSON.stringify(t0));
  await page.screenshot({ path: OUT + '/1_train.png' });

  // 2) 同色无效点击不扣步
  const b0 = await page.evaluate(() => window.__game.board[0]);
  await page.evaluate(c => { window.__game.setBrush(c); }, b0);
  const s0 = await page.evaluate(() => window.__game.stepsLeft);
  await page.evaluate(() => window.__game.tap(0));
  const s1 = await page.evaluate(() => window.__game.stepsLeft);
  console.log('2 同色点击:', s0, '->', s1, s0 === s1 ? 'OK(不扣步)' : 'FAIL');

  // 3) 异色有效点击扣 1 步
  await page.evaluate(() => { const b = window.__game.board; window.__game.setBrush((b[0] + 1) % 4); window.__game.tap(0); });
  const s2 = await page.evaluate(() => window.__game.stepsLeft);
  console.log('3 异色点击: ->', s2, s2 === s0 - 1 ? 'OK' : 'FAIL');

  // 4) 重置按钮
  await page.click('#btnReset');
  await page.waitForTimeout(300);
  const s3 = await page.evaluate(() => window.__game.stepsLeft);
  console.log('4 重置: ->', s3, s3 === s0 ? 'OK' : 'FAIL');

  // 5) 连续失败 3 次 → 师姐助力
  for (let f = 1; f <= 3; f++) {
    let guard = 0;
    while (guard++ < 25) {
      const g = await page.evaluate(() => ({ b: window.__game.board, t: window.__game.target, o: window.__game.over }));
      if (g.o) break;
      const mv = zeroGainMove(g.b, g.t);
      if (!mv) break;
      await page.evaluate(m => { window.__game.setBrush(m.brush); window.__game.tap(m.cell); }, mv);
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => ({ fc: window.__game.failCount, assist: window.__game.assistOn, steps: window.__game.stepsLeft, budget: window.__game.budget, over: window.__game.over, overlay: document.getElementById('overlay').classList.contains('show') }));
    console.log(`5 失败第${f}次后:`, JSON.stringify(st), f < 3 ? (!st.assist ? 'OK(未助力)' : 'FAIL') : (st.assist && st.steps === st.budget + 2 ? 'OK(助力+2)' : 'FAIL'), st.overlay ? 'FAIL(弹出了遮罩)' : '');
  }
  await page.screenshot({ path: OUT + '/2_assist.png' });

  // 6) 回到世界
  await page.click('#btnMode');
  await page.waitForTimeout(400);
  const w0 = await page.evaluate(() => ({ mode: window.__game.mode, lv: document.getElementById('questlv').textContent, budget: window.__game.budget, steps: window.__game.stepsLeft, label: document.getElementById('modelabel').textContent }));
  console.log('6 回到世界:', JSON.stringify(w0), w0.mode === 'world' && w0.budget === 1 ? 'OK' : 'FAIL');
  await page.screenshot({ path: OUT + '/3_world.png' });

  // 7) 世界第 1 关一步通关
  await page.evaluate(() => { window.__game.setBrush(1); const b = window.__game.board; window.__game.tap(b.findIndex(v => v === 0)); });
  await page.waitForTimeout(1000);
  const w1 = await page.evaluate(() => ({ title: document.getElementById('ovtitle').textContent, overlay: document.getElementById('overlay').classList.contains('show') }));
  console.log('7 世界1关通关:', JSON.stringify(w1), w1.overlay ? 'OK' : 'FAIL');
  await page.screenshot({ path: OUT + '/4_world_win.png' });

  // 8) 下一关 → 画盘-2
  await page.click('#ovbtns .btn');
  await page.waitForTimeout(400);
  const w2 = await page.evaluate(() => ({ lv: document.getElementById('questlv').textContent, budget: window.__game.budget, fc: window.__game.failCount, assist: window.__game.assistOn }));
  console.log('8 画盘-2:', JSON.stringify(w2), w2.lv === '画盘-2' && w2.budget === 2 && !w2.assist ? 'OK' : 'FAIL');

  // 9) 修炼模式通关链路（贪心自动打）
  await page.click('#btnMode');
  await page.waitForTimeout(400);
  let guard = 0;
  while (guard++ < 30) {
    const g = await page.evaluate(() => ({ b: window.__game.board, t: window.__game.target, o: window.__game.over }));
    if (g.o) break;
    const mv = bestMove(g.b, g.t);
    await page.evaluate(m => { window.__game.setBrush(m.brush); window.__game.tap(m.cell); }, mv);
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(900);
  const t1 = await page.evaluate(() => ({ title: document.getElementById('ovtitle').textContent, overlay: document.getElementById('overlay').classList.contains('show') }));
  console.log('9 修炼通关:', JSON.stringify(t1));

  console.log('控制台错误数:', errors.length);
  errors.slice(0, 5).forEach(e => console.log('  ERR:', e.slice(0, 160)));
  await browser.close();
})().catch(e => { console.error('QA 失败:', e.message); process.exit(1); });
