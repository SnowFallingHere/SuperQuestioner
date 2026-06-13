import json
import re
import os
from itertools import combinations

# File config: (filepath, chapter_name)
FILES = [
    (r"h:\tencent\download\24-25-1题库\0导论新.docx", "导论"),
    (r"h:\tencent\download\24-25-1题库\1第一章（修）.docx", "第一章"),
    (r"h:\tencent\download\24-25-1题库\2第二章（新）.docx", "第二章"),
    (r"h:\tencent\download\24-25-1题库\3_第三章题库更新.doc", "第三章"),
    (r"h:\tencent\download\24-25-1题库\4 第四章(1).docx", "第四章"),
    (r"h:\tencent\download\24-25-1题库\5第五章 新.docx", "第五章"),
    (r"h:\tencent\download\24-25-1题库\6第六章题库修订.docx", "第六章"),
    (r"h:\tencent\download\24-25-1题库\7第七章更新.doc", "第七章"),
]

DIFFICULTY_MAP = {"易": "easy", "中": "medium", "难": "hard"}

# Match various answer formats
ANSWER_RE = re.compile(r"^(?:正确)?答案[：:]?\s*([A-Z]+|正确|错误)$")
# Match difficulty
DIFFICULTY_RE = re.compile(r"^难(?:易程度|度)[：:]\s*(.+)$")
# Match option line: "A.xxx" or "A、xxx" or "A．xxx" or "D矛盾" (missing dot)
OPTION_RE = re.compile(r"^([A-Z])[.、．\s]\s*(.*)")
# Strict option: must have a separator
OPTION_STRICT_RE = re.compile(r"^([A-Z])[.、．]\s*(.*)")
# Match section header
SECTION_RE = re.compile(r"^[一二三四五六七八九十]+[、．.]\s*(单选|多选|判断)")
# Match inline answer in question: "(  D  )" or "(D)" or "（  C  ）"
INLINE_ANSWER_RE = re.compile(r"[（(]\s*([A-Z])\s*[）)]")
# Match inline option at end of question: "（ ）A.科学性"
INLINE_OPTION_RE = re.compile(r"[（(]\s*[）)]\s*([A-Z])[.、．]\s*(.*)")


def clean_line(line):
    return line.replace("\xa0", " ").strip()


def convert_doc_to_docx(doc_path):
    import win32com.client
    abs_path = os.path.abspath(doc_path)
    docx_path = abs_path + "x"
    if os.path.exists(docx_path):
        return docx_path
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = False
    doc = word.Documents.Open(abs_path)
    doc.SaveAs2(docx_path, FileFormat=16)
    doc.Close()
    word.Quit()
    print("  Converted .doc -> .docx: %s" % docx_path)
    return docx_path


def read_docx(filepath):
    from docx import Document
    doc = Document(filepath)
    lines = []
    for p in doc.paragraphs:
        text = p.text
        for sub_line in text.split("\n"):
            lines.append(sub_line)
    return lines


def read_file(filepath):
    if filepath.lower().endswith(".docx"):
        return read_docx(filepath)
    elif filepath.lower().endswith(".doc"):
        docx_path = convert_doc_to_docx(filepath)
        return read_docx(docx_path)
    else:
        raise ValueError("Unsupported file format: %s" % filepath)


def extract_inline_answer(line):
    m = INLINE_ANSWER_RE.search(line)
    if m:
        answer = m.group(1)
        cleaned = INLINE_ANSWER_RE.sub("（  ）", line)
        return cleaned, answer
    return line, None


def extract_inline_options(line):
    options = []
    for m in INLINE_OPTION_RE.finditer(line):
        options.append({"label": m.group(1), "text": m.group(2).strip()})
    if options:
        cleaned = INLINE_OPTION_RE.sub("（  ）", line)
        return cleaned, options
    return line, []


def is_answer_line(line):
    return ANSWER_RE.match(line) is not None


def is_difficulty_line(line):
    return DIFFICULTY_RE.match(line) is not None


def is_option_line(line):
    return OPTION_STRICT_RE.match(line) is not None


def is_section_header(line):
    return SECTION_RE.match(line) is not None


def parse_lines(lines):
    """
    Parse lines into questions.
    Strategy: find answer lines, then collect question content before them
    and difficulty after them.
    """
    cleaned = [clean_line(l) for l in lines]

    # Remove section headers and empty lines, but keep track of original order
    filtered = []
    for line in cleaned:
        if not line:
            continue
        if is_section_header(line):
            continue
        filtered.append(line)

    # Find all answer line indices
    answer_indices = []
    for i, line in enumerate(filtered):
        if is_answer_line(line):
            answer_indices.append(i)

    # Build blocks: for each answer, collect from previous answer's end to this answer
    # plus any difficulty line after
    blocks = []
    prev_end = 0
    for idx in answer_indices:
        # Block starts after previous block ended
        # Block ends at this answer line, plus difficulty if present
        end = idx + 1
        if end < len(filtered) and is_difficulty_line(filtered[end]):
            end += 1
        block = filtered[prev_end:end]
        blocks.append(block)
        prev_end = end

    # Parse each block
    questions = []
    for block in blocks:
        q = parse_block(block)
        if q:
            questions.append(q)

    return questions


def clean_question_text(text):
    """Remove section headers and question number prefixes from question text."""
    # Remove section headers like "三，判断", "一，单选", "二，多选" etc.
    text = re.sub(r'^[一二三四五六七八九十]+[，,、]\s*(?:判断|单选|多选)\s*', '', text)
    # Remove question number prefixes: "１.", "２.", "1.", "2.", "1、", "2、" etc.
    # Full-width numbers
    text = re.sub(r'^[０-９]+[.、．]\s*', '', text)
    # Half-width numbers
    text = re.sub(r'^\d+[.、．]\s*', '', text)
    return text.strip()


def parse_block(block):
    """
    Parse a block of lines (ending with an answer line) into a question dict.
    Block structure: [question_lines...] [option_lines...] [answer] [difficulty]
    """
    if not block:
        return None

    # Extract answer (last answer line in block)
    answer = None
    answer_idx = -1
    for i, line in enumerate(block):
        m = ANSWER_RE.match(line)
        if m:
            answer = m.group(1).strip()
            answer_idx = i

    if answer is None:
        return None

    # Extract difficulty (after answer)
    difficulty = None
    for line in block[answer_idx + 1:]:
        m = DIFFICULTY_RE.match(line)
        if m:
            diff_text = m.group(1).strip()
            # Handle "难易程度：C" case (answer in difficulty field)
            if diff_text in DIFFICULTY_MAP:
                difficulty = DIFFICULTY_MAP[diff_text]
            elif diff_text in ("A", "B", "C", "D") or len(diff_text) > 1:
                # This is likely an answer mistakenly placed in difficulty field
                # Check if it looks like an answer
                if re.match(r'^[A-Z]+$', diff_text):
                    answer = diff_text
                    difficulty = "unknown"
                else:
                    difficulty = "unknown"

    # Everything before the answer line is question + options
    content_lines = block[:answer_idx]

    # Separate options from question
    # Options are lines starting with A. B. C. D. (or A、 B、 etc.)
    # But option A might not have a prefix - it's the first non-question line
    # before B.

    question_parts = []
    options = []

    # Find where options start
    # Look for the first option line (B. C. D. are reliable indicators)
    option_start_idx = None
    for i, line in enumerate(content_lines):
        m = OPTION_STRICT_RE.match(line)
        if m and m.group(1) in ("B", "C", "D"):
            option_start_idx = i
            break

    if option_start_idx is not None:
        # Everything before option_start_idx is question + option A
        # Check if the line just before the B/C/D option is option A (without prefix)
        pre_option = content_lines[:option_start_idx]
        option_lines = content_lines[option_start_idx:]

        # The last line(s) of pre_option might be option A without prefix
        # Heuristic: if we find B./C./D., the line just before B is likely option A
        # But question might also span multiple lines

        # Find option A: look for "A." in pre_option, or the last line is option A
        a_idx = None
        for i, line in enumerate(pre_option):
            m = OPTION_STRICT_RE.match(line)
            if m and m.group(1) == "A":
                a_idx = i
                break
            # Also check loose match like "A " (A followed by space but no dot)
            m2 = OPTION_RE.match(line)
            if m2 and m2.group(1) == "A":
                a_idx = i
                break

        if a_idx is not None:
            # Lines before a_idx are question
            question_parts = pre_option[:a_idx]
            # Option A - check if it contains question text before "A."
            a_line = pre_option[a_idx]
            m = OPTION_RE.match(a_line)
            if m:
                a_text = m.group(2).strip()
                # Check if option A text itself contains another option pattern
                # e.g., "马克思主义是对自然...（ ）A.科学性" where the whole line
                # starts with question text and A. is embedded
                # In this case, a_idx is 0 and there's no question_parts
                if not question_parts and a_text:
                    # The option A text might contain the question before "A."
                    # Look for pattern like "（ ）A." or question ending before A.
                    # Split at the first occurrence of question-ending pattern
                    # before the actual option content
                    pass
                options.append({"label": "A", "text": a_text})
            else:
                options.append({"label": "A", "text": a_line})
        else:
            # No "A." found at start of line - check if last line contains embedded "A."
            # e.g., "马克思主义是对自然...（ ）A.科学性"
            if pre_option:
                last_line = pre_option[-1]
                # Check if this line contains an inline option pattern like "（ ）A.xxx" or just "A.xxx" near the end
                # Try to split at "A." that appears after "（ ）" or near the end
                split_idx = None
                # Look for "（ ）A." or "( )A." pattern
                inline_m = re.search(r'[（(]\s*[）)]\s*A[.、．]\s*', last_line)
                if inline_m:
                    split_idx = inline_m.start()
                    a_text = last_line[inline_m.end():]
                else:
                    # Look for "A." that's not at the very start (embedded in text)
                    # Find the last occurrence of "A." that's preceded by a space or parenthesis
                    for m in re.finditer(r'(?:[）)\s])A[.、．]\s*', last_line):
                        split_idx = m.start()
                        a_text = last_line[m.end():]

                if split_idx is not None:
                    question_parts = pre_option[:-1] + [last_line[:split_idx].strip()]
                    options.append({"label": "A", "text": a_text.strip()})
                else:
                    # The last line before B/C/D is option A (without prefix)
                    question_parts = pre_option[:-1]
                    options.append({"label": "A", "text": pre_option[-1]})
            else:
                question_parts = []

        # Parse remaining options (B, C, D, etc.)
        for line in option_lines:
            m = OPTION_RE.match(line)
            if m:
                options.append({"label": m.group(1), "text": m.group(2).strip()})
            else:
                # Continuation of previous option
                if options:
                    options[-1]["text"] += line
    else:
        # No B/C/D options found
        # Check if there are any option lines at all
        has_any_option = False
        for line in content_lines:
            if OPTION_RE.match(line):
                has_any_option = True
                break

        if has_any_option:
            # Only A option (unlikely but possible)
            for i, line in enumerate(content_lines):
                m = OPTION_RE.match(line)
                if m:
                    question_parts = content_lines[:i]
                    options.append({"label": m.group(1), "text": m.group(2).strip()})
                    break
        else:
            # True/false question - all content is the question
            question_parts = content_lines

    # Build question text
    question_text = " ".join(question_parts)

    # Check for inline answer and options in question text
    cleaned_text, inline_answer = extract_inline_answer(question_text)
    cleaned_text, inline_options = extract_inline_options(cleaned_text)

    if inline_answer and answer is None:
        answer = inline_answer
    if inline_options:
        options = inline_options + options

    question_text = cleaned_text.strip()

    # Clean question text: remove section headers and question numbers
    question_text = clean_question_text(question_text)

    return {
        "question": question_text,
        "options": options,
        "answer": answer,
        "difficulty": difficulty or "unknown",
    }


def determine_type(answer):
    if answer is None:
        return "unknown"
    answer = answer.strip()
    if answer in ("正确", "错误"):
        return "true_false"
    letters = re.findall(r"[A-Z]", answer)
    if len(letters) == 1:
        return "single_choice"
    elif len(letters) >= 2:
        return "multiple_choice"
    return "unknown"


def _score_partition(stem, options):
    """Score a partition of question text into stem + options.
    Higher score means more plausible partition."""
    score = 0

    if not stem:
        return -100

    # Stem ending: natural break points for Chinese choice questions
    last_char = stem[-1]
    natural_endings = set('是的有为了者')
    if last_char in natural_endings:
        score += 20
    elif last_char == '）':
        score += 20
    elif last_char in '，、；：':
        score -= 15
    elif last_char in '。！？':
        score += 5

    # Stem should be reasonably long
    stem_len = len(stem)
    if stem_len >= 10:
        score += 5
    elif stem_len >= 5:
        score += 3
    elif stem_len < 3:
        score -= 10

    # Option quality checks
    if options:
        opt_lens = [len(o) for o in options]
        min_ol = min(opt_lens)
        max_ol = max(opt_lens)

        # Very short options are suspicious (likely fragments from line breaks)
        if min_ol <= 1:
            score -= 20
        elif min_ol == 2:
            score -= 5
        elif min_ol >= 3:
            score += 5

        # Options shouldn't be extremely unbalanced in length
        if min_ol > 0:
            ratio = max_ol / min_ol
            if ratio <= 2:
                score += 5
            elif ratio <= 4:
                score += 2
            elif ratio > 8:
                score -= 5

    return score


def fix_missing_options(q):
    """Post-process: for choice questions with no options, try to extract
    options embedded in the question text (no A/B/C/D prefixes)."""
    answer = q.get("answer", "")
    options = q.get("options", [])

    # Only fix choice questions with no options
    if not answer or options:
        return
    if not re.match(r'^[A-Z]+$', answer):
        return

    # Always assume 4 options (standard for Chinese exams)
    num_options = 4

    text = q["question"]
    tokens = text.split()
    n = len(tokens)

    if n < num_options + 1:
        return

    # Try all partitions of n tokens into (1 stem + num_options options) groups
    best_score = -float('inf')
    best_stem = None
    best_opts = None

    num_groups = num_options + 1

    for cuts in combinations(range(n - 1), num_groups - 1):
        boundaries = [0] + [c + 1 for c in cuts] + [n]
        # Join tokens within each group without spaces (Chinese text;
        # spaces are artifacts from line breaks in the original docx)
        groups = [''.join(tokens[boundaries[i]:boundaries[i + 1]])
                  for i in range(num_groups)]

        stem = groups[0]
        opts = groups[1:]

        score = _score_partition(stem, opts)
        if score > best_score:
            best_score = score
            best_stem = stem
            best_opts = opts

    if best_stem is not None and best_score > 0:
        # Clean up option texts: strip leading letter prefix like "A" in
        # "A经济和政治发展不平衡规律" (letter label without separator)
        cleaned_opts = []
        for i, opt in enumerate(best_opts):
            expected_label = chr(ord('A') + i)
            if opt.startswith(expected_label) and len(opt) > 1 and re.match(r'^[A-Z][\u4e00-\u9fff]', opt):
                opt = opt[1:]
            cleaned_opts.append(opt)
        q["question"] = best_stem
        q["options"] = [
            {"label": chr(ord('A') + i), "text": opt}
            for i, opt in enumerate(cleaned_opts)
        ]


def process_file(filepath, chapter_name, global_seq):
    lines = read_file(filepath)
    raw_questions = parse_lines(lines)

    results = []
    for q in raw_questions:
        qtype = determine_type(q["answer"])
        difficulty = q.get("difficulty") or "unknown"

        # Fix missing options for choice questions
        fix_missing_options(q)

        entry = {
            "sequence": global_seq,
            "chapter": chapter_name,
            "type": qtype,
            "difficulty": difficulty,
            "question": q["question"],
            "answer": q["answer"],
        }
        if q["options"]:
            entry["options"] = q["options"]

        results.append(entry)
        global_seq += 1

    return results, global_seq


def main():
    all_questions = []
    global_seq = 1

    for filepath, chapter in FILES:
        print("Processing: %s (%s)" % (filepath, chapter))
        try:
            questions, global_seq = process_file(filepath, chapter, global_seq)
            all_questions.extend(questions)
            print("  Found %d questions" % len(questions))
        except Exception as e:
            print("  ERROR: %s" % e)
            import traceback
            traceback.print_exc()

    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "questions.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_questions, f, ensure_ascii=False, indent=2)

    print("\nTotal: %d questions" % len(all_questions))
    print("Output: %s" % output_path)

    from collections import Counter
    type_counts = Counter(q["type"] for q in all_questions)
    for t, c in type_counts.items():
        print("  %s: %d" % (t, c))


if __name__ == "__main__":
    main()
