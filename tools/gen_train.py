# 依赖：标准库。修炼关卡的早期随机生成器，仅留档（现役为 gen_train2.py）。
# -*- coding: utf-8 -*-
"""离线生成修炼模式 30 个固定关卡（与 JS 端同算法：纯随机 + 并块到目标块数）。
输出 JS 数组文本，供内嵌 template.html。种子固定，可复现。"""
import json
import random

COLS, ROWS, N = 9, 7, 63
IDX = "RYBG"


def neighbors(i):
    r, c = divmod(i, COLS)
    out = []
    if c > 0: out.append(i-1)
    if c < COLS-1: out.append(i+1)
    if r > 0: out.append(i-COLS)
    if r < ROWS-1: out.append(i+COLS)
    return out


def flood(b, seed):
    col = b[seed]
    seen = {seed}
    stack = [seed]
    region = []
    while stack:
        i = stack.pop()
        region.append(i)
        for j in neighbors(i):
            if j not in seen and b[j] == col:
                seen.add(j)
                stack.append(j)
    return region


def components(b):
    seen = set()
    comps = []
    for i in range(N):
        if i not in seen:
            r = flood(b, i)
            seen.update(r)
            comps.append((r, b[i]))
    return comps


def grow(b, region, c):
    reg = set(region)
    seen = set(region)
    stack = []
    for i in region:
        for j in neighbors(i):
            if j not in seen and b[j] == c:
                seen.add(j)
                stack.append(j)
    while stack:
        x = stack.pop()
        reg.add(x)
        for j in neighbors(x):
            if j not in seen and b[j] == c:
                seen.add(j)
                stack.append(j)
    return reg


def greedy(b, target):
    region, col = max(components(b), key=lambda t: len(t[0]))
    region = set(region)
    sim = list(b)
    steps = 0
    while len(region) < N:
        best, bc, br = -1, col, region
        for c in range(4):
            if c == col:
                continue
            r2 = grow(sim, region, c)
            if len(r2) - len(region) > best:
                best, bc, br = len(r2) - len(region), c, r2
        for i in region:
            sim[i] = bc
        region, col = br, bc
        steps += 1
    if col != target:
        steps += 1
    return steps


def want_comps(lv):
    rng = random.Random(7000 + lv)
    if lv <= 2: return 5 + rng.randrange(3)
    if lv <= 5: return 9 + rng.randrange(4)
    if lv <= 9: return 12 + rng.randrange(4)
    if lv <= 14: return 14 + rng.randrange(4)
    if lv <= 20: return 16 + rng.randrange(5)
    return 18 + rng.randrange(7)


def gen_level(lv):
    want = want_comps(lv)
    rng = random.Random(1000 + lv)
    b = [rng.randrange(4) for _ in range(N)]
    guard = 0
    while guard < 600:
        guard += 1
        comps = components(b)
        if len(comps) <= want:
            break
        pairs = []
        for i in range(N):
            for j in neighbors(i):
                if j > i and b[j] != b[i]:
                    pairs.append((i, j))
        if not pairs:
            break
        a, c = pairs[rng.randrange(len(pairs))]
        rA, rB = flood(b, a), flood(b, c)
        if len(rA) <= len(rB):
            for i in rA: b[i] = b[c]
        else:
            for i in rB: b[i] = b[a]
    target = rng.randrange(4)
    est = greedy(b, target)
    budget = est + (2 if lv <= 2 else 0)
    return {
        "grid": "".join(IDX[x] for x in b),
        "target": target,
        "budget": budget,
        "comps": len(components(b)),
        "est": est,
    }


out = []
for lv in range(1, 31):
    m = gen_level(lv)
    out.append(m)
    print("修炼-%-2d 块%2d 估步%2d 预算%d 目标%s" % (lv, m["comps"], m["est"], m["budget"], IDX[m["target"]]))

js = ",\n".join('{grid:"%s",target:%d,budget:%d}' % (m["grid"], m["target"], m["budget"]) for m in out)
with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "src", "train_levels.js"), "w", encoding="utf-8") as f:
    f.write(js)
print("\n已写出 train_levels.js，共", len(out), "关")
