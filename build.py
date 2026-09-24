#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""一键重建 index.html（自包含单文件）。

把 src/template.html 里的三个占位符替换为：
  __B64_FULL__      -> assets/shijie_full_q.png 的 base64（师姐立绘）
  __B64_BG__        -> assets/bg.jpg 的 base64（游戏内背景图）
  __TRAIN_LEVELS__  -> src/train_levels.js 的关卡数据

用法：  python build.py
依赖：  仅标准库
"""
import base64
import os

ROOT = os.path.dirname(os.path.abspath(__file__))


def b64(rel):
    with open(os.path.join(ROOT, rel), "rb") as f:
        return base64.b64encode(f.read()).decode()


def main():
    tpl = open(os.path.join(ROOT, "src", "template.html"), encoding="utf-8").read()
    train = open(os.path.join(ROOT, "src", "train_levels.js"), encoding="utf-8").read()
    html = (tpl.replace("__B64_FULL__", "data:image/png;base64," + b64("assets/shijie_full_q.png"))
               .replace("__B64_BG__", "data:image/jpeg;base64," + b64("assets/bg.jpg"))
               .replace("__TRAIN_LEVELS__", train))
    for tok in ("__B64_FULL__", "__B64_BG__", "__TRAIN_LEVELS__"):
        assert tok not in html, "占位符未替换：" + tok
    out = os.path.join(ROOT, "index.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print("已生成 %s（%.0f KB）" % (out, len(html) / 1024))


if __name__ == "__main__":
    main()
