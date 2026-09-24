# 依赖：Pillow + 配套技能的 solve_fast（同 gen_train2.py）。
#       输入为 assets/world_src/ 下的三张路线图。
# -*- coding: utf-8 -*-
"""v3：图幅 1920×1080，5 帧棋盘槽位固定。
提取 → 链条自检自愈（重放必须逐帧一致）→ 图注尺寸核对 → solve_fast 确认最优。"""
import json
import sys

from PIL import Image

SKILL = os.environ.get("CBP_SKILL",
         os.path.expanduser("~/.workbuddy/skills/coloring-board-puzzle"))
sys.path.insert(0, os.path.join(SKILL, "scripts"))
from solve_fast import Model, recommend  # noqa: E402

W, H, N = 9, 7, 63
IDX = "RYBG"
REFS = {"R": (238, 122, 106), "G": (122, 220, 160), "B": (168, 210, 240), "Y": (245, 220, 110)}
THR = 40
SLOTS = [((52, 420), (215, 500)), ((499, 866), (215, 500)), ((945, 1313), (215, 500)),
         ((52, 420), (671, 956)), ((499, 866), (671, 956))]  # F1..F5

JOBS = [
    {"name": "14", "img": r"assets/world_src/a05a8393beebabb2f159234fde1a08b8.png",
     "tap": [1, 3], "seq": "RGYRB", "budget": 5, "sizes": [7, 16, 26, 43, 53], "target": "B"},
    {"name": "15", "img": r"assets/world_src/bc6170a633e3f950a930a7c5f217da6f.png",
     "tap": [2, 2], "seq": "YGRYB", "budget": 5, "sizes": [6, 17, 31, 40, 52], "target": "B"},
    {"name": "16", "img": r"assets/world_src/11ad26255d684bb8e734fef9afedc243.png",
     "tap": [3, 5], "seq": "BGRYB", "budget": 5, "sizes": [1, 4, 13, 41, 49], "target": "B"},
]


def classify(px):
    best, bd = None, 10 ** 9
    for k, ref in REFS.items():
        d = (px[0]-ref[0])**2 + (px[1]-ref[1])**2 + (px[2]-ref[2])**2
        if d < bd:
            best, bd = k, d
    return best if bd < THR * THR else None


def refine(counts, gap=25):
    """把密集键按 <=gap 的间距并为连续段，返回最长段 (起,止)。"""
    keys = sorted(counts)
    runs2 = []
    start = prev = None
    for x in keys:
        if start is None:
            start = prev = x
        elif x - prev <= gap:
            prev = x
        else:
            runs2.append((start, prev))
            start = prev = x
    if start is not None:
        runs2.append((start, prev))
    runs2.sort(key=lambda r: r[1] - r[0], reverse=True)
    return runs2[0]


def extract_at(im, xslot, yslot):
    px = im.load()
    xlo, xhi = xslot
    ylo, yhi = yslot
    colcnt = {}
    rowcnt = {}
    for y in range(ylo, yhi + 1):
        for x in range(xlo, xhi + 1):
            k = classify(px[x, y])
            if k:
                colcnt[x] = colcnt.get(x, 0) + 1
                rowcnt[y] = rowcnt.get(y, 0) + 1
    (bx0, bx1) = refine(colcnt)
    (by0, by1) = refine(rowcnt)
    cw, ch = (bx1 - bx0 + 1) / W, (by1 - by0 + 1) / H
    grid = []
    for r in range(H):
        for c in range(W):
            votes = {}
            for ox in (-12, -6, 0, 6, 12):
                for oy in (-12, -6, 0, 6, 12):
                    x = int(bx0 + cw * (c + 0.5) + ox)
                    y = int(by0 + ch * (r + 0.5) + oy)
                    k = classify(px[x, y])
                    if k:
                        votes[k] = votes.get(k, 0) + 1
            if not votes:
                raise SystemExit("空格子 r%d c%d" % (r, c))
            grid.append(max(votes, key=votes.get))
    return grid


def neigh(i):
    r, c = divmod(i, W)
    o = []
    if c > 0: o.append(i - 1)
    if c < W - 1: o.append(i + 1)
    if r > 0: o.append(i - W)
    if r < H - 1: o.append(i + W)
    return o


def flood(b, seed):
    col = b[seed]
    seen = {seed}
    st = [seed]
    reg = []
    while st:
        i = st.pop()
        reg.append(i)
        for j in neigh(i):
            if j not in seen and b[j] == col:
                seen.add(j)
                st.append(j)
    return reg


def chain_solve(frames, tap, seq, target_ch):
    f1 = frames[0][:]
    cell = (tap[0] - 1) * W + (tap[1] - 1)
    job_target_holder = [target_ch]
    for attempt in range(10):
        b = f1[:]
        sizes = []
        bad = None
        for k, ch in enumerate(seq):
            reg = flood(b, cell)
            for i in reg:
                b[i] = ch
            sizes.append(len(reg))
            if k + 1 >= len(frames):
                break  # 最后一帧只到第 4 步；第 5 步用「终局全目标色」验证
            nxt = frames[k + 1]
            mism = [i for i in range(N) if b[i] != nxt[i]]
            if mism:
                heal = [i for i in mism if nxt[i] != ch]
                if heal:
                    for i in heal:
                        f1[i] = nxt[i]
                    bad = "第%d步 %d 格不一致，已自愈" % (k + 1, len(heal))
                else:
                    return None, None, "第%d步染色区硬冲突 %s" % (k + 1, mism[:6])
                break
        if bad is None:
            bad_cells = [(i, b[i]) for i in range(N) if b[i] != job_target_holder[0]]
            if bad_cells:
                print("  [调试] 终局非目标格:", bad_cells[:10], " 共", len(bad_cells))
                return None, None, "重放终局不是全目标色"
            return f1, sizes, "链条一致"
    return None, None, "自愈 10 轮未收敛"


def main():
    entries = []
    for job in JOBS:
        im = Image.open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                               job["img"])).convert("RGB")
        frames = [extract_at(im, xs, ys) for (xs, ys) in SLOTS]
        f1, sizes, report = chain_solve(frames, job["tap"], job["seq"], job["target"])
        if f1 is None:
            raise SystemExit("画盘-%s: %s" % (job["name"], report))
        size_ok = sizes == job["sizes"]
        grid_s = "".join(f1)
        print("画盘-%s %s" % (job["name"], grid_s))
        print("  重放 %s vs 图注 %s %s | %s"
              % (sizes, job["sizes"], "OK" if size_ok else "FAIL", report))
        if not size_ok:
            raise SystemExit("画盘-%s 校验不通过" % job["name"])
        rows = [grid_s[r*W:(r+1)*W] for r in range(H)]
        m = Model(rows, job["target"], IDX)
        Lf, by_comp = m.fixed_all(12)
        if Lf is None or Lf != len(job["seq"]):
            raise SystemExit("画盘-%s 求解器最优 %s != 图注 %s" % (job["name"], Lf, len(job["seq"])))
        good = [(ci, s) for ci, ss in by_comp.items() for s in ss]
        ci, rseq, _a, _b, _k = recommend(m, good, IDX)
        rtap = list(min(m.comps[ci]))
        print("  solve_fast: 最优 %d 步 点%s 顺序 %s (图注 %s %s)"
              % (Lf, rtap, "".join(IDX[c] for c in rseq), job["tap"], job["seq"]))
        entries.append('{grid:\'%s\',target:%d,budget:%d,tap:%s,seq:\'%s\'}'
                       % (grid_s, IDX.index(job["target"]), job["budget"],
                          json.dumps(job["tap"]), job["seq"]))
    with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "src", "world_levels_14_16.js"), "w", encoding="utf-8") as f:
        f.write(",\n".join(entries))
    print("\n== 三关验证通过，world_new.js 已更新 ==")


if __name__ == "__main__":
    main()
