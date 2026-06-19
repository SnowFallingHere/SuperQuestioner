import json
import re

with open('Marxism.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"总题目数: {len(data)}")
print("=" * 80)

# 问题1: 选项数量不是4的 (仅检查 choice 类型)
print("\n【问题1】single_choice/multiple_choice 选项数量 != 4 的题目:")
bad_options = []
for i, q in enumerate(data):
    t = q.get('type', '')
    if t not in ('single_choice', 'multiple_choice'):
        continue
    opts = q.get('options', [])
    if len(opts) != 4:
        bad_options.append((i, q))
        seq = q.get('sequence', '?')
        print(f"  [{i}] sequence={seq} type={t} options_count={len(opts)}")
        print(f"        question: {q.get('question', '')[:80]}")
        if opts:
            for o in opts:
                print(f"          {o.get('label')}: {o.get('text', '')[:60]}")

print(f"\n共 {len(bad_options)} 题选项数不为4\n")
print("=" * 80)

# 问题2: 题干包含 "一、" 或题号前缀
print("\n【问题2】题干含异常前缀（如'一、单项选择题 X.'）:")
bad_prefix = []
prefixes = ['一、单项选择题', '二、多项选择题', '三、判断题', '四、简答题',
            '五、论述题', '六、材料分析题', '七、辨析题']
for i, q in enumerate(data):
    question = q.get('question', '')
    for p in prefixes:
        if question.startswith(p):
            bad_prefix.append((i, q, p))
            seq = q.get('sequence', '?')
            print(f"  [{i}] sequence={seq} type={q.get('type','?')} 前缀='{p}'")
            print(f"        原始question: {question[:120]}")
            break

print(f"\n共 {len(bad_prefix)} 题题干含异常前缀")
print("=" * 80)

# 问题3: difficulty == unknown
print("\n【问题3】difficulty == 'unknown' 的题目:")
unknown_diff = []
for i, q in enumerate(data):
    if q.get('difficulty') == 'unknown':
        unknown_diff.append((i, q))
        seq = q.get('sequence', '?')
        t = q.get('type', '?')
        ques = q.get('question', '')
        length = len(ques)
        # 根据长度判断建议难度
        if length <= 30:
            suggest = 'easy'
        elif length <= 60:
            suggest = 'medium'
        else:
            suggest = 'hard'
        print(f"  [{i}] sequence={seq} type={t} 当前=unknown 建议={suggest} (字数={length})")
        print(f"        question: {ques[:100]}")

print(f"\n共 {len(unknown_diff)} 题 difficulty=unknown")
print("=" * 80)

# 问题4: 题干以数字+点开头（如 "1." "12."）或含多余空格
print("\n【问题4】题干以数字+点开头或含异常格式的题目:")
bad_format = []
num_prefix_pattern = re.compile(r'^[\d一二三四五六七八九十]+[\.、]\s*')
for i, q in enumerate(data):
    question = q.get('question', '')
    if num_prefix_pattern.match(question):
        if not any(question.startswith(p) for p in prefixes):
            bad_format.append((i, q))
            seq = q.get('sequence', '?')
            print(f"  [{i}] sequence={seq} type={q.get('type','?')}")
            print(f"        question: {question[:100]}")

print(f"\n共 {len(bad_format)} 题题干格式异常")
print("=" * 80)

# 汇总
total_issues = len(bad_options) + len(bad_prefix) + len(unknown_diff) + len(bad_format)
print(f"\n汇总:")
print(f"  - 选项数异常: {len(bad_options)}")
print(f"  - 前缀异常: {len(bad_prefix)}")
print(f"  - difficulty=unknown: {len(unknown_diff)}")
print(f"  - 题干格式异常: {len(bad_format)}")
print(f"总计问题题目: {total_issues}")
