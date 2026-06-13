import json
import re
import os
from itertools import combinations

# File config: (filepath, chapter_name)
FILES = [
    (r"e:\SuperQuestioner\SuperQuestioner\0导论新.docx", "导论"),
    (r"e:\SuperQuestioner\SuperQuestioner\1第一章（修）.docx", "第一章"),
    (r"e:\SuperQuestioner\SuperQuestioner\2第二章（新）.docx", "第二章"),
    (r"e:\SuperQuestioner\SuperQuestioner\3_第三章题库更新.doc", "第三章"),
    (r"e:\SuperQuestioner\SuperQuestioner\4 第四章(1).docx", "第四章"),
    (r"e:\SuperQuestioner\SuperQuestioner\5第五章 新.docx", "第五章"),
    (r"e:\SuperQuestioner\SuperQuestioner\6第六章题库修订.docx", "第六章"),
    (r"e:\SuperQuestioner\SuperQuestioner\7第七章更新.doc", "第七章"),
]

EXPORT_NAME = "Marxism.json"

DIFFICULTY_MAP = {"易": "easy", "中": "medium", "难": "hard"}

# Match various answer formats.  The separator (冒号 or space) is required —
# without it we'd mis-parse sentences containing bare "答案".
ANSWER_RE = re.compile(r"^(?:正确)?答案[：:\s]\s*([A-Z]+|正确|错误)$")
# Match difficulty
DIFFICULTY_RE = re.compile(r"^难(?:易程度|度)[：:]\s*(.+)$")
# Match option line: "A.xxx" or "A、xxx" or "A．xxx" or "D矛盾" (missing dot)
OPTION_RE = re.compile(r"^([A-Z])[.、．\s]\s*(.*)")
# Strict option: must have a separator
OPTION_STRICT_RE = re.compile(r"^([A-Z])[.、．]\s*(.*)")
# Option with no separator: "D矛盾的特殊性" (letter directly before CJK text)
OPTION_CJK_RE = re.compile(r"^([A-Z])([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef].*)$")
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
    # plus any difficulty line after them. The answer line is ALWAYS the boundary of a
    # question — even if the following "difficulty line" contains A/B/C/D letters
    # (e.g. "难易程度：C"), it must not leak into the next question.
    blocks = []
    prev_end = 0
    for idx in answer_indices:
        end = idx + 1
        # Absorb 0 or 1 difficulty lines that immediately follow the answer line
        while end < len(filtered) and is_difficulty_line(filtered[end]):
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


def split_embedded_options(options):
    """
    Split option texts that contain inline option markers for subsequent options.
    E.g. text = "随机性选择的道路    B.英雄人物选择的道路"
         → splits into {label:A, text:随机性选择的道路} and {label:B, text:英雄人物选择的道路}
    This handles lines where the original .doc file placed multiple options on one line.
    """
    result = []
    for opt in options:
        text = opt["text"]
        # Look for embedded B/C/D markers that appear mid-text (not at line start)
        m = re.search(r'(?<=.)\s*([B-D])[.、．]\s*', text)
        if m:
            before = text[:m.start()].strip()
            label = m.group(1)
            after = text[m.end():].strip()
            result.append({"label": opt["label"], "text": before})
            nested = split_embedded_options([{"label": label, "text": after}])
            result.extend(nested)
        else:
            result.append(opt)
    return result


def parse_block(block):
    """
    Parse a block of lines (ending with an answer line) into a question dict.
    Block structure: [question_lines...] [option_lines...] [answer] [difficulty]
    """
    if not block:
        return None

    # Extract answer — use the FIRST answer line found. (Previously it used the
    # last one, which could overwrite a correct answer from the last occurrence
    # "答案：X"  within the same block.
    answer = None
    answer_idx = -1
    for i, line in enumerate(block):
        m = ANSWER_RE.match(line)
        if m and answer is None:
            answer = m.group(1).strip()
            answer_idx = i
            break

    if answer is None:
        return None

    # Extract difficulty (after answer)
    # The difficulty line looks like "难易程度：中" / "难度：易".  If it contains a
    # letter (A/B/C/D), that's likely a copy-paste artifact from the original doc —
    # NEVER overwrite the already-parsed answer with it.
    difficulty = None
    for line in block[answer_idx + 1:]:
        m = DIFFICULTY_RE.match(line)
        if m:
            diff_text = m.group(1).strip()
            mapped = DIFFICULTY_MAP.get(diff_text)
            if mapped is not None:
                difficulty = mapped
            else:
                # Looks like "难易程度：C" — record difficulty as unknown,
                # do NOT touch answer.
                difficulty = "unknown"

    # Everything before the answer line is question + options
    content_lines = block[:answer_idx]

    # Robust option extraction:
    #   - Scan every line; a line that starts with "<LETTER>." (or 、/．) is the
    #     start of a NEW option, with that letter as its label.
    #   - If a second "A." appears, that marks the start of the next question's
    #     stem — stop collecting options at once (this is the real split point
    #     that prevents two adjacent questions from being merged).
    #   - Any content before the very first option line is treated as the
    #     question stem.
    #   - The option "A" may be embedded at the end of a question line, like
    #     "...的观点是（ ）A.相对主义的观点" — split at the embedded "A.".
    question_parts = []
    options = []
    seen_labels = set()
    first_option_found = False

    i = 0
    while i < len(content_lines):
        line = content_lines[i]
        # 1) A line that starts with a letter + dot -> option
        m_start = OPTION_STRICT_RE.match(line)
        if not m_start:
            # Fallback: allow space as separator (some docs use "D 矛盾的特殊性")
            m_start = OPTION_RE.match(line)
        if not m_start:
            # Fallback: letter directly before CJK text, no separator ("D矛盾的特殊性")
            m_start = OPTION_CJK_RE.match(line)
        if m_start:
            label = m_start.group(1)
            text = m_start.group(2).strip()
            # If we've already seen this label, it's likely a NEW question's
            # first option. Stop collecting.
            if label in seen_labels:
                break
            # If we've seen ANY options before but this label breaks A/B/C/D
            # order (e.g. after "C." we see "A."), it's also a new question.
            if seen_labels and (label <= max(seen_labels) or label not in "ABCDEFGH"):
                break
            seen_labels.add(label)
            options.append({"label": label, "text": text})
            first_option_found = True
            i += 1
            continue

        # 2) Line does NOT start with a letter-dot, but CONTAINS one embedded
        #    somewhere inside — only treat as option-A if it's the FIRST such
        #    match (i.e. we haven't found any options yet).
        if not first_option_found:
            embedded_m = re.search(r'(?:[（(]\s*[）)]\s*)?([A-Z])[.、．]\s*', line)
            if embedded_m and embedded_m.group(1) == "A":
                split_pos = embedded_m.start(1)
                question_tail = line[:split_pos].strip()
                a_text = line[embedded_m.end():].strip()
                if question_tail:
                    question_parts.append(question_tail)
                options.append({"label": "A", "text": a_text})
                seen_labels.add("A")
                first_option_found = True
                i += 1
                continue

        # 3) Otherwise it's either a question-stem line or a stray continuation
        #    line. Append to question_parts (unless we already passed through
        #    some options, in which case it's a leftover we ignore to avoid
        #    swallowing neighboring-question stems).
        if not first_option_found:
            question_parts.append(line)
        # If we HAVE started options, fall through silently — don't extend.
        i += 1

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

    # Split options that have embedded next-option markers in their text
    # e.g. "A.随机性选择的道路    B.英雄人物选择的道路" → A + B as separate options
    options = split_embedded_options(options)

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

    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), EXPORT_NAME)
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
