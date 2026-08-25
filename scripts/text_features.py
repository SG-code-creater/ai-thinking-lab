#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文本特征量化（P3 / D3）—— 组间对比分析脚本
================================================

读入后台导出的 messages.csv（/api/admin/export?type=messages），
按实验臂（arm）汇总以下文本特征，用于回答「AI 是限制还是增强思考」：

  1. 提问密度 question_density
     —— 含问号（? 或 ？）的消息数 / 总消息数。
        预期：臂1(苏格拉底) 应显著高于 臂2(自由问答)。
  2. 第一人称占比 first_person_ratio
     —— 「我/咱/我们/咱们」出现次数 / 总字符数（千分比）。
  3. 行动词频 action_word_freq
     —— 「我+决定/尝试/打算/会/想/准备/计划/去做/先」等行动意图词
        出现次数 / 总字符数（千分比）。
  4. 情绪词频 emotion_word_freq
     —— 内置情绪词典命中次数 / 总字符数（千分比）。

输出：
  - 控制台打印按臂汇总表；
  - 写出 text_features_by_arm.csv（每行一个臂的上述指标，外加消息数、字符数）。

用法：
  python scripts/text_features.py messages.csv
  python scripts/text_features.py messages.csv -o out.csv
  python scripts/text_features.py /path/to/messages.csv --min-chars 30

依赖：仅 Python 标准库（csv / re / argparse / sys），无需 pip 安装。
CSV 编码兼容 utf-8 与 utf-8-sig（Excel 导出常见）。
"""

import argparse
import csv
import os
import re
import sys
from collections import defaultdict

# ---------- 中文词典（可按研究需要自行扩充） ----------

FIRST_PERSON = ["我", "咱", "我们", "咱们"]

# 行动意图词：表达「我要去做 / 我能做」的倾向，反映受试者从倾诉转向行动
ACTION_PATTERNS = [
    r"我决定", r"我尝试", r"我打算", r"我会", r"我想(去|要|先|办法)",
    r"我准备", r"我计划", r"我去做", r"我去跟", r"我先", r"我约",
    r"我找他", r"我跟他", r"我主动",
]

# 情绪词（简版）：焦虑/愤怒/委屈/孤独/压力等常见情绪线索
EMOTION_WORDS = [
    "焦虑", "烦躁", "生气", "愤怒", "恼火", "委屈", "难过", "伤心", "崩溃",
    "孤独", "寂寞", "压抑", "压力", "紧张", "害怕", "恐惧", "烦躁", "堵心",
    "糟心", "闹心", "烦", "怒", "委屈", "无助", "绝望", "抑郁", "低落",
    "开心", "高兴", "轻松", "踏实", "欣慰", "舒服", "平静",
]

ACTION_RE = re.compile("|".join(ACTION_PATTERNS))
EMOTION_RE = re.compile("|".join(map(re.escape, EMOTION_WORDS)))
FIRST_PERSON_RE = re.compile("|".join(map(re.escape, FIRST_PERSON)))
QUESTION_RE = re.compile(r"[?？]")


def read_csv(path):
    """读取 messages.csv，返回 list[dict]，兼容 utf-8 / utf-8-sig。"""
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    if not rows:
        raise SystemExit("错误：CSV 为空或没有表头。请确认导出了 messages.csv。")
    # 必要的列
    need = {"arm", "role", "content"}
    missing = need - set(rows[0].keys())
    if missing:
        raise SystemExit(
            f"错误：CSV 缺少必要列 {missing}。请使用后台导出的 messages.csv。"
        )
    return rows


def analyze(rows, min_chars=0):
    """按臂汇总文本特征。"""
    # 每臂累计
    stats = defaultdict(
        lambda: {"msgs": 0, "chars": 0, "questions": 0,
                 "fp": 0, "action": 0, "emotion": 0}
    )
    for r in rows:
        arm = (r.get("arm") or "unknown").strip() or "unknown"
        content = r.get("content") or ""
        s = stats[arm]
        s["msgs"] += 1
        n = len(content)
        s["chars"] += n
        if n < min_chars:
            continue
        if QUESTION_RE.search(content):
            s["questions"] += 1
        s["fp"] += len(FIRST_PERSON_RE.findall(content))
        s["action"] += len(ACTION_RE.findall(content))
        s["emotion"] += len(EMOTION_RE.findall(content))
    return stats


def summarize(stats):
    """把累计值转成比率指标。"""
    out = []
    for arm, s in stats.items():
        chars = max(s["chars"], 1)
        msgs = max(s["msgs"], 1)
        out.append({
            "arm": arm,
            "messages": s["msgs"],
            "total_chars": s["chars"],
            "question_density": round(s["questions"] / msgs, 4),
            "first_person_per_1k": round(s["fp"] / chars * 1000, 2),
            "action_word_per_1k": round(s["action"] / chars * 1000, 2),
            "emotion_word_per_1k": round(s["emotion"] / chars * 1000, 2),
        })
    out.sort(key=lambda x: x["arm"])
    return out


def print_table(summary):
    cols = ["arm", "messages", "question_density", "first_person_per_1k",
            "action_word_per_1k", "emotion_word_per_1k"]
    headers = ["臂", "消息数", "提问密度", "第一人称/千字", "行动词/千字", "情绪词/千字"]
    widths = [max(len(str(x)) for x in [h] + [row[c] for row in summary])
              for h, c in zip(headers, cols)]
    line = "  ".join(h.ljust(w) for h, w in zip(headers, widths))
    print("\n=== 文本特征 · 按臂汇总 ===")
    print(line)
    print("-" * len(line))
    for row in summary:
        cells = [str(row[c]) for c in cols]
        print("  ".join(c.ljust(w) for c, w in zip(cells, widths)))
    print()


def write_csv(summary, out_path):
    cols = ["arm", "messages", "total_chars", "question_density",
            "first_person_per_1k", "action_word_per_1k", "emotion_word_per_1k"]
    with open(out_path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for row in summary:
            w.writerow({c: row[c] for c in cols})


def main():
    ap = argparse.ArgumentParser(
        description="文本特征量化（提问密度/第一人称/行动词/情绪词）按臂汇总")
    ap.add_argument("csv", help="messages.csv 路径")
    ap.add_argument("-o", "--output", default="text_features_by_arm.csv",
                    help="输出 CSV 路径（默认 text_features_by_arm.csv）")
    ap.add_argument("--min-chars", type=int, default=0,
                    help="单条消息低于该字数则不计入特征统计（默认 0，即全部计入）")
    args = ap.parse_args()

    if not os.path.exists(args.csv):
        raise SystemExit(f"错误：找不到文件 {args.csv}")

    rows = read_csv(args.csv)
    stats = analyze(rows, min_chars=args.min_chars)
    summary = summarize(stats)
    print_table(summary)
    write_csv(summary, args.output)
    print(f"已写出：{args.output}")


if __name__ == "__main__":
    main()
