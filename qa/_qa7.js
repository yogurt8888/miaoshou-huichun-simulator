const { chromium } = require('playwright-core');
const URL = 'file:///' + process.env.TEMP.replace(/\\/g, '/') + '/峡谷画盘_build/index.html';
const OUT = process.env.TEMP + '/峡谷画盘_build/_qa';
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

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(URL);
  await page.waitForTimeout(900);

  // 0) 教程新文案
  const tutTxt = await page.evaluate(() => {
    const t = document.getElementById('tuttxt').textContent;
    return t;
  });
  console.log('0 教程文案:', tutTxt.includes('一关失败三次，或是点击师姐三次') ? 'OK' : 'FAIL', '|', tutTxt);
  await page.evaluate(() => document.getElementById('tutskip').click());

  // 1) 锁定与选中样式
  const p0 = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.chip')];
    const cur = chips.find(c => c.classList.contains('cur'));
    const cs = getComputedStyle(cur);
    return {
      total: chips.length,
      locks: chips.filter(c => c.classList.contains('lock')).length,
      chip1IsCur: chips[0].classList.contains('cur') && !chips[0].classList.contains('lock'),
      curBg: cs.backgroundImage, curColor: cs.color,
      lpCount: document.getElementById('lp-count').textContent,
    };
  });
  const cream = p0.curBg.includes('linear-gradient') && p0.curColor === 'rgb(107, 66, 38)';
  console.log('1 面板:', JSON.stringify({ ...p0, curBg: p0.curBg.slice(0, 30) + '...' }));
  console.log('  30关/29锁/1号选中:', p0.total === 30 && p0.locks === 29 && p0.chip1IsCur ? 'OK' : 'FAIL',
    '| 米黄选中:', cream ? 'OK' : 'FAIL',
    '| 面板提示:', p0.lpCount.includes('通关解锁下一关') ? 'OK' : 'FAIL');
  await page.screenshot({ path: OUT + '/10_panel.png' });

  // 2) 点锁定的第 5 关 → 提示且不跳
  await page.click('.chip[data-i="4"]');
  await page.waitForTimeout(400);
  const t5 = await page.evaluate(() => ({
    toast: document.getElementById('toast').textContent,
    lv: document.getElementById('questlv').textContent,
  }));
  console.log('2 点锁定关:', JSON.stringify(t5),
    t5.toast.includes('锁') && t5.lv === '修炼-1' ? 'OK' : 'FAIL');

  // 3) 自动通关第 1 关 → 第 2 关解锁
  for (let g = 0; g < 30; g++) {
    const st = await page.evaluate(() => ({ b: window.__game.board, t: window.__game.target, o: window.__game.over }));
    if (st.o) break;
    const mv = bestMove(st.b, st.t);
    await page.evaluate(m => { window.__game.setBrush(m.brush); window.__game.tap(m.cell); }, mv);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(2200);
  const c2 = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.chip')];
    return { done1: chips[0].classList.contains('done'), lock2: chips[1].classList.contains('lock') };
  });
  console.log('3 通1关后:', JSON.stringify(c2), c2.done1 && !c2.lock2 ? 'OK(2号解锁)' : 'FAIL');

  // 4) 点第 2 关进入
  await page.evaluate(() => { const b = document.querySelector('#ovbtns .btn'); if (b) b.click(); });
  await page.waitForTimeout(400);
  await page.click('.chip[data-i="1"]');
  await page.waitForTimeout(300);
  const lv2 = await page.evaluate(() => document.getElementById('questlv').textContent);
  console.log('4 进入第2关:', lv2, lv2 === '修炼-2' ? 'OK' : 'FAIL');

  // 5) 世界模式同样上锁
  await page.click('#btnMode');
  await page.waitForTimeout(400);
  const w = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.chip')];
    return { total: chips.length, locks: chips.filter(c => c.classList.contains('lock')).length };
  });
  console.log('5 世界模式:', JSON.stringify(w), w.total === 13 && w.locks === 12 ? 'OK' : 'FAIL');

  console.log('控制台错误数:', errors.length);
  errors.slice(0, 5).forEach(e => console.log('  ERR:', e.slice(0, 160)));
  await browser.close();
})().catch(e => { console.error('QA 失败:', e.message); process.exit(1); });
