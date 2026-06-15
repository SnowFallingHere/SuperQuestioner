import json
import re

with open('Marxism.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"总题目数: {len(data)}")
fixed_count = 0

# 清理题干末尾的括号（如 "（  ）" "()" "（）" 等）
bracket_pattern = re.compile(r'[\s]*[（(][\s]*[）)][\s]*$')

for i, q in enumerate(data):
    question = q.get('question', '')
    original_q = question
    
    # 清理末尾括号
    new_q = bracket_pattern.sub('', question)
    if new_q != question:
        q['question'] = new_q
        fixed_count += 1
        print(f"  [{i}] sequence={q.get('sequence')}")
        print(f"       原: {original_q}")
        print(f"       新: {new_q}")

print(f"\n共修复 {fixed_count} 道题")

# 保存
with open('Marxism.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("已保存到 Marxism.json")
