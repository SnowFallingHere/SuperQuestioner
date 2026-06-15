import json
import re

with open('Marxism.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"总题目数: {len(data)}")
fixed_count = 0

# 需要清理的前缀模式
prefix_patterns = [
    r'^【单选】\s*\d+[、.\s]*',
    r'^【多选】\s*\d*[、.\s]*',
    r'^【判断】\s*\d*[、.\s]*',
    r'^第六章题库\s*',
]

# 需要清理的垃圾后缀模式 (如 "答案：错误 9、xxx")
trash_patterns = [
    r'答案[：:]\s*(正确|错误)\s*\d+[、.]',
]

for i, q in enumerate(data):
    modified = False
    question = q.get('question', '')
    original_q = question

    # 1. 清理题干前缀
    for pattern in prefix_patterns:
        new_q = re.sub(pattern, '', question)
        if new_q != question:
            question = new_q
            modified = True

    # 2. 清理垃圾后缀 (如 "答案：错误 9、暴力革命...")
    for pattern in trash_patterns:
        match = re.search(pattern, question)
        if match:
            # 截断到垃圾内容开始的位置
            question = question[:match.start()].strip()
            modified = True

    # 应用清理后的题干
    if modified:
        q['question'] = question.strip()
        print(f"  [{i}] sequence={q.get('sequence')} 清理题干: {original_q[:60]}... -> {question[:60]}...")

    # 3. 修复 difficulty=unknown
    if q.get('difficulty') == 'unknown':
        length = len(q.get('question', ''))
        if length <= 30:
            new_diff = 'easy'
        elif length <= 60:
            new_diff = 'medium'
        else:
            new_diff = 'hard'
        q['difficulty'] = new_diff
        print(f"  [{i}] sequence={q.get('sequence')} difficulty: unknown -> {new_diff} (字数={length})")
        modified = True

    if modified:
        fixed_count += 1

print(f"\n共修复 {fixed_count} 道题")

# 保存
with open('Marxism.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("已保存到 Marxism.json")
