# 依赖：Pillow。读 assets/shijie_src.png，产出 assets/ 下的去背与量化版本。
# -*- coding: utf-8 -*-
"""把 assets/shijie_src.png 处理成网页可用的透明底素材。
白底去背 -> 裁边 -> 产出 assets/shijie_full{,_q}.png 与 shijie_head{,_q}.png
"""
import base64
import io
import os
from collections import deque

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "shijie_src.png")
OUTDIR = os.path.join(ROOT, "assets")
os.makedirs(OUTDIR, exist_ok=True)

TOL = 26
SOFT = 1


def keyout(im):
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    bg = bytearray(w * h)

    def is_white(p):
        return p[0] > 255 - TOL and p[1] > 255 - TOL and p[2] > 255 - TOL

    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_white(px[x, y]) and not bg[y * w + x]:
                bg[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_white(px[x, y]) and not bg[y * w + x]:
                bg[y * w + x] = 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0 <= nx < w and 0 <= ny < h and not bg[ny * w + nx] and is_white(px[nx, ny]):
                bg[ny * w + nx] = 1
                q.append((nx, ny))

    mask = Image.frombytes("L", (w, h), bytes(bytearray(255 if not b else 0 for b in bg)))
    if SOFT:
        mask = mask.filter(ImageFilter.GaussianBlur(SOFT))
    im.putalpha(mask)
    return im


def crop_bbox(im, pad=6):
    bbox = im.getchannel("A").getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    return im.crop((max(0, l-pad), max(0, t-pad), min(im.width, r+pad), min(im.height, b+pad)))


def save(im, path, max_w):
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    im.save(path, optimize=True)
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return im.size, os.path.getsize(path), len(base64.b64encode(buf.getvalue()))


im = Image.open(SRC)
print("原图:", im.size, im.mode)
cut = crop_bbox(keyout(im))
print("去背后:", cut.size)

p1 = os.path.join(OUTDIR, "shijie_full.png")
print("全身:", save(cut, p1, 480), "->", p1)

head = cut.crop((int(cut.width*0.14), 0, int(cut.width*0.86), int(cut.height*0.52)))
hw, hh = head.size
side = min(hw, hh)
head = head.crop(((hw-side)//2, 0, (hw-side)//2+side, side))
p2 = os.path.join(OUTDIR, "shijie_head.png")
print("头像:", save(head, p2, 256), "->", p2)
