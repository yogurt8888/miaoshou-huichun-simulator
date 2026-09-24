# 依赖：Pillow + 配套技能 coloring-board-puzzle 的 scripts/solve_fast.py
#       技能路径可用环境变量 CBP_SKILL 指定，默认 ~/.workbuddy/skills/coloring-board-puzzle
# -*- coding: utf-8 -*-
"""修炼模式 30 关重做：图形化关卡（条纹/L/X/回字/十字/棋盘格/镜像/Z/斜带/散点），
并用 solve_fast 的 BFS 同格求解器算出每关真最优解（点击格 + 换色顺序）。
输出：train_levels.js（内嵌用）+ contact.png（全部棋盘预览图，人工验形）。"""
import os
import random
import sys

SKILL = os.environ.get("CBP_SKILL",
         os.path.expanduser("~/.workbuddy/skills/coloring-board-puzzle"))
sys.path.insert(0, os.path.join(SKILL, "scripts"))
from solve_fast import Model, recommend  # noqa: E402

from PIL import Image, ImageDraw  # noqa: E402

W, H, N = 9, 7, 63
IDX = "RYBG"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = ROOT


def neigh(i):
    r, c = divmod(i, W)
    o = []
    if c > 0: o.append(i-1)
    if c < W-1: o.append(i+1)
    if r > 0: o.append(i-W)
    if r < H-1: o.append(i+W)
    return o


def flood(flat, seed):
    col = flat[seed]
    seen = {seed}
    st = [seed]
    reg = []
    while st:
        i = st.pop()
        reg.append(i)
        for j in neigh(i):
            if j not in seen and flat[j] == col:
                seen.add(j)
                st.append(j)
    return reg


def ncomps(flat):
    seen = set()
    n = 0
    for i in range(N):
        if i not in seen:
            seen.update(flood(flat, i))
            n += 1
    return n


# ---------------------------------------------------------------- 图形生成器
def blank(v=0):
    return [[v]*W for _ in range(H)]


def pat_stripes(rng):
    b = blank()
    vertical = rng.random() < 0.65
    ncol = rng.choice([2, 2, 3])
    cols = rng.sample(range(4), ncol)
    total = W if vertical else H
    widths, rem = [], total
    for i in range(ncol - 1):
        w = rng.randint(2, max(2, rem - 2*(ncol-1-i)))
        widths.append(w); rem -= w
    widths.append(rem)
    x = 0
    for i, w in enumerate(widths):
        for k in range(x, min(total, x + w)):
            for t in range(H if vertical else W):
                if vertical: b[t][k] = cols[i]
                else: b[k][t] = cols[i]
        x += w
    return b


def pat_L(rng):
    A, Bc = rng.sample(range(4), 2)
    b = blank(Bc)
    t = rng.randint(1, 2)
    corner = rng.randrange(4)
    for r in range(H):
        for c in range(W):
            inL = False
            if corner == 0 and (c < t or r >= H - t): inL = True
            if corner == 1 and (c >= W - t or r >= H - t): inL = True
            if corner == 2 and (c < t or r < t): inL = True
            if corner == 3 and (c >= W - t or r < t): inL = True
            if inL: b[r][c] = A
    others = [x for x in range(4) if x != A]
    for _ in range(rng.randint(2, 4)):
        col = rng.choice(others)
        s = rng.choice([1, 2, 2])
        cr, cc = rng.randint(0, H - s), rng.randint(0, W - s)
        for dr in range(s):
            for dc in range(s):
                if b[cr+dr][cc+dc] == Bc: b[cr+dr][cc+dc] = col
    return b


def pat_X(rng):
    A = rng.randrange(4)
    others = [x for x in range(4) if x != A]
    qc = [rng.choice(others) for _ in range(2)]
    b = blank()
    thick = rng.choice([0.8, 1.1])
    for r in range(H):
        for c in range(W):
            d1 = abs(r - c * 6 / 8)
            d2 = abs(r - (6 - c * 6 / 8))
            if d1 < thick or d2 < thick:
                b[r][c] = A
            else:
                top = (r < c * 6 / 8) and (r < 6 - c * 6 / 8)
                bottom = (r > c * 6 / 8) and (r > 6 - c * 6 / 8)
                if top: b[r][c] = qc[0]
                elif bottom: b[r][c] = qc[1]
                else: b[r][c] = qc[(c * 2 // W) % 2] if rng.random() < 0.5 else qc[0]
    return b


def pat_ring(rng):
    A, Bc, C = rng.sample(range(4), 3)
    b = blank()
    for r in range(H):
        for c in range(W):
            d = min(r, H-1-r, c, W-1-c)
            b[r][c] = A if d == 0 else (Bc if d == 1 else C)
    Dc = ([x for x in range(4) if x not in (A, Bc, C)] + [C])[0]
    b[3][4] = Dc
    return b


def pat_cross(rng):
    A = rng.randrange(4)
    others = [x for x in range(4) if x != A]
    t = 1 if rng.random() < 0.65 else 2
    qc = [rng.choice(others) for _ in range(4)]
    b = blank()
    for r in range(H):
        for c in range(W):
            if abs(r - 3) < t or abs(c - 4) < t:
                b[r][c] = A
            else:
                qi = (0 if r < 3 else 1) * 2 + (0 if c < 4 else 1)
                b[r][c] = qc[qi]
    return b


def pat_checker(rng):
    A, Bc = rng.sample(range(4), 2)
    bw = rng.choice([2, 2, 3])
    b = blank()
    for r in range(H):
        for c in range(W):
            b[r][c] = A if ((r // bw) + (c // bw)) % 2 == 0 else Bc
    C3 = rng.choice([x for x in range(4) if x not in (A, Bc)])
    for _ in range(rng.randint(1, 3)):
        s = rng.choice([2, 3])
        cr, cc = rng.randint(0, H - s), rng.randint(0, W - s)
        for dr in range(s):
            for dc in range(s):
                b[cr+dr][cc+dc] = C3
    return b


def pat_mirror(rng):
    b = blank(-1)
    for _ in range(rng.randint(4, 6)):
        col = rng.randrange(4)
        s = rng.choice([2, 3])
        cr, cc = rng.randint(0, H - s), rng.randint(0, 4)
        for dr in range(s):
            for dc in range(s):
                if cc + dc <= 4: b[cr+dr][cc+dc] = col
    changed = True
    while changed:
        changed = False
        for r in range(H):
            for c in range(5):
                if b[r][c] == -1:
                    for dr, dc in ((0,1),(1,0),(0,-1),(-1,0)):
                        rr, cc2 = r+dr, c+dc
                        if 0 <= rr < H and 0 <= cc2 < 5 and b[rr][cc2] != -1:
                            b[r][c] = b[rr][cc2]
                            changed = True
                            break
    for r in range(H):
        for c in range(W):
            if c > 4: b[r][c] = b[r][8 - c]
            if b[r][c] == -1: b[r][c] = rng.randrange(4)
    return b


def pat_z(rng):
    A = rng.randrange(4)
    Bc, Cc = rng.sample([x for x in range(4) if x != A], 2)
    b = blank()
    for r in range(H):
        for c in range(W):
            b[r][c] = Bc if r < 3 else Cc
    t = rng.randint(1, 2)
    for c in range(W):
        for k in range(t):
            b[k][c] = A
            b[H-1-k][c] = A
        rr = round(6 - c * 6 / 8)
        for k in range(t):
            if 0 <= rr + k < H: b[rr+k][c] = A
    return b


def pat_diag(rng):
    ncol = rng.choice([2, 3])
    cols = rng.sample(range(4), ncol)
    w = rng.randint(2, 3)
    b = blank()
    for r in range(H):
        for c in range(W):
            b[r][c] = cols[((r + c) // w) % ncol]
    return b


def pat_dots(rng):
    A = rng.randrange(4)
    others = [x for x in range(4) if x != A]
    b = blank(A)
    for _ in range(rng.randint(6, 10)):
        col = rng.choice(others)
        shape = rng.choice(["dot", "sq", "plus"])
        cr, cc = rng.randint(0, H-1), rng.randint(0, W-1)
        if shape == "dot":
            b[cr][cc] = col
        elif shape == "sq":
            for dr in range(2):
                for dc in range(2):
                    if cr+dr < H and cc+dc < W: b[cr+dr][cc+dc] = col
        else:
            for dr, dc in ((0,0),(0,1),(0,-1),(1,0),(-1,0)):
                rr, cc2 = cr+dr, cc+dc
                if 0 <= rr < H and 0 <= cc2 < W: b[rr][cc2] = col
    return b


PATTERNS = [("条纹", pat_stripes), ("L型", pat_L), ("X型", pat_X), ("回字", pat_ring),
            ("十字", pat_cross), ("棋盘格", pat_checker), ("镜像", pat_mirror),
            ("Z型", pat_z), ("斜带", pat_diag), ("散点", pat_dots)]


# ---------------------------------------------------------------- 难度调整
def flat(b):
    return [b[r][c] for r in range(H) for c in range(W)]


def to2d(f):
    return [f[r*W:(r+1)*W] for r in range(H)]


def adjust(f, want_lo, want_hi, rng):
    guard = 0
    while ncomps(f) > want_hi and guard < 300:
        guard += 1
        pairs = []
        for i in range(N):
            for j in neigh(i):
                if j > i and f[j] != f[i]:
                    pairs.append((i, j))
        if not pairs: break
        a, c = pairs[rng.randrange(len(pairs))]
        rA, rB = flood(f, a), flood(f, c)
        if len(rA) <= len(rB):
            for i in rA: f[i] = f[c]
        else:
            for i in rB: f[i] = f[a]
    guard = 0
    while ncomps(f) < want_lo and guard < 300:
        guard += 1
        i = rng.randrange(N)
        others = [x for x in range(4) if x != f[i]]
        f[i] = rng.choice(others)
    return f


def want_band(lv):
    if lv <= 2: return (5, 7)
    if lv <= 5: return (9, 12)
    if lv <= 9: return (12, 15)
    if lv <= 14: return (14, 17)
    if lv <= 20: return (16, 20)
    return (18, 24)


def solve_optimal(f, target):
    grid = ["".join(IDX[x] for x in f[r*W:(r+1)*W]) for r in range(H)]
    m = Model(grid, IDX[target], IDX)
    Lf, by_comp = m.fixed_all(12)
    if Lf is None:
        return None
    good = [(ci, s) for ci, ss in by_comp.items() for s in ss]
    ci, seq, _fr, _sz, _k = recommend(m, good, IDX)
    tap = min(m.comps[ci])
    return Lf, [tap[0] + 1, tap[1] + 1], "".join(IDX[c] for c in seq)


def main():
    rng = random.Random(20260919)
    order = list(range(len(PATTERNS)))
    rng.shuffle(order)
    levels = []
    tries = 0
    for lv in range(1, 31):
        pname, gen = PATTERNS[order[(lv - 1) % len(PATTERNS)]]
        lo, hi = want_band(lv)
        sol = None
        for _ in range(40):
            tries += 1
            f = adjust(flat(gen(rng)), lo, hi, rng)
            t = rng.randrange(4)
            if len(set(f)) == 1:
                continue
            sol = solve_optimal(f, t)
            if sol and sol[0] <= 10 and not (lv <= 2 and sol[0] > 5):
                break
            sol = None
        if not sol:
            raise SystemExit("第 %d 关生成失败" % lv)
        Lf, tap, seq = sol
        budget = Lf + (2 if lv <= 2 else 0)
        levels.append({"grid": "".join(IDX[x] for x in f), "target": t,
                       "budget": budget, "tap": tap, "seq": seq,
                       "comps": ncomps(f), "pat": pname, "Lf": Lf})
        print("修炼-%-2d [%-4s] 块%2d 最优%d 预算%d 点%s 顺序 %s 目标%s"
              % (lv, pname, ncomps(f), Lf, budget, tap, seq, IDX[t]))

    js = ",\n".join(
        '{grid:"%s",target:%d,budget:%d,tap:%s,seq:"%s"}'
        % (m["grid"], m["target"], m["budget"], m["tap"], m["seq"]) for m in levels)
    with open(os.path.join(OUT, "src", "train_levels.js"), "w", encoding="utf-8") as fo:
        fo.write(js)
    print("\ntrain_levels.js 已更新（%d 关，生成尝试 %d 次）" % (len(levels), tries))

    # 预览图：6 列 × 5 行
    PAL = [(242,163,152), (246,221,141), (167,201,240), (166,226,173)]
    cell, pad = 26, 3
    bw, bh = W * (cell + pad) + pad, H * (cell + pad) + pad + 18
    sheet = Image.new("RGB", (6 * (bw + 10) + 10, 5 * (bh + 10) + 10), (240, 230, 210))
    d = ImageDraw.Draw(sheet)
    for i, m in enumerate(levels):
        ox = 10 + (i % 6) * (bw + 10)
        oy = 10 + (i // 6) * (bh + 10)
        d.text((ox + 2, oy), "修炼-%d %s 块%d 步%d" % (i + 1, m["pat"], m["comps"], m["Lf"]), fill=(90, 60, 40))
        g = m["grid"]
        for r in range(H):
            for c in range(W):
                x0 = ox + pad + c * (cell + pad)
                y0 = oy + 18 + pad + r * (cell + pad)
                d.rectangle([x0, y0, x0 + cell, y0 + cell],
                            fill=PAL[IDX.index(g[r*W+c])], outline=(120, 90, 70))
        # 标记最优解点击格
        tr, tc = m["tap"][0] - 1, m["tap"][1] - 1
        x0 = ox + pad + tc * (cell + pad) + cell // 2
        y0 = oy + 18 + pad + tr * (cell + pad) + cell // 2
        d.ellipse([x0 - 7, y0 - 7, x0 + 7, y0 + 7], outline=(30, 30, 30), width=2)
    os.makedirs(os.path.join(OUT, "qa"), exist_ok=True)
    sheet.save(os.path.join(OUT, "qa", "contact.png"))
    print("预览图: _qa/contact.png")


if __name__ == "__main__":
    main()
