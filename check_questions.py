import json

with open('Marxism.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"总题目数: {len(data)}")
print("=" * 80)

# 问题1: 选项数量不是4的
print("\n【问题1】选项数量 != 4 的题目:")
bad_options = []
for i, q in enumerate(data):
    opts = q.get('options', [])
    if len(opts) != 4:
        bad_options.append((i, q))
        seq = q.get('sequence', '?')
        t = q.get('type', '?')
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
    # 检查各种前缀
    for p in prefixes:
        if question.startswith(p):
            bad_prefix.append((i, q, p))
            seq = q.get('sequence', '?')
            print(f"  [{i}] sequence={seq} type={q.get('type','?')} 前缀='{p}'")
            print(f"        原始question: {question[:120]}")
            break
    # 也检查 "X." 数字+点 开头的（如 "1."）
    import re
    if re.match(r'^[一二三四五六七八九十\d]+[、.\s]', question) and not any(question.startswith(p) for p in prefixes):
        # 排除正常的以数字/汉字开头的合理题目
        pass

print(f"\n共 {len(bad_prefix)} 题题干含异常前缀")
print("=" * 80)

# 额外: 检查 label 是否连续 A B C D
print("\n【问题3】选项label不连续/不标准(A/B/C/D)的:")
bad_labels = []
for i, q in enumerate(data):
    opts = q.get('options', [])
    if not opts:
        continue
    labels = [o.get('label', '') for o in opts]
    expected = ['A', 'B', 'C', 'D'][:len(opts)]
    if labels != expected:
        bad_labels.append((i, q, labels))
        seq = q.get('sequence', '?')
        print(f"  [{i}] sequence={seq} labels={labels} (期望{expected})")

print(f"\n共 {len(bad_labels)} 题label不标准")
print("=" * 80)

# 汇总
total_issues = len(bad_options) + len(bad_prefix) + len(bad_labels)
print(f"\n汇总: 选项数异常={len(bad_options)}, 前缀异常={len(bad_prefix)}, label异常={len(bad_labels)}")
print(f"总计问题题目: {total_issues}")
