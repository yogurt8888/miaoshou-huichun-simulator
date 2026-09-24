# 依赖：配套技能的 assets/levels/levels.json（可用 CBP_SKILL 指定技能根目录）。
# -*- coding: utf-8 -*-
"""重新生成 world_levels.js（单引号，避免转义问题）并安全替换模板里的数组。"""
import json
import re

SKILL = os.environ.get("CBP_SKILL",
         os.path.expanduser("~/.workbuddy/skills/coloring-board-puzzle"))
SRC = os.path.join(SKILL, "assets", "levels", "levels.json")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = ROOT

d = json.load(open(SRC, encoding="utf-8"))
parts = []
for k in sorted(d["levels"], key=lambda x: int(x)):
    m = d["levels"][k]
    parts.append("{grid:'%s',target:%d,budget:%d,tap:%s,seq:'%s'}"
                 % (m["grid"], "RYBG".index(m["target"]), m["budget"],
                    json.dumps(m["tap"]), m["seq"]))
wl = ",\n  ".join(parts)

p = os.path.join(BUILD, "src", "template.html")
t = open(p, encoding="utf-8").read()
t2, n = re.subn(r"var WORLD_LEVELS = \[.*?\];",
                lambda _m: "var WORLD_LEVELS = [\n  " + wl + "];",
                t, count=1, flags=re.S)
assert n == 1
open(p, "w", encoding="utf-8").write(t2)
open(os.path.join(BUILD, "src", "world_levels.js"), "w", encoding="utf-8").write(wl)
print("WORLD_LEVELS 已安全替换（单引号版，13 关）")
