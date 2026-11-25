"""Compile private topic notes into course packs and a page-evidence report."""

import argparse
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import random
import re
import sys
import unicodedata


PRIVATE = Path(__file__).resolve().parent.parent / ".private"
WORD = re.compile(r"[^\W_]+", re.UNICODE)
VI_VARIANTS = str.maketrans("đĐƣƢ", "dDuU")
TCVN3_VI = str.maketrans(
    "µ¸¶·¹¨»¾¼½Æ©ÇÊÈÉË®ÌÐÎÏÑªÒÕÓÔÖ×ÝØÜÞßãáâä«åèæçé¬êíëìîïóñòô­õøö÷ùúýûüþ¡¢§£¤¥¦",
    "àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵĂÂĐÊÔƠƯ",
)
LEGACY_HANDLES = {"11535"}


@dataclass(frozen=True)
class Topic:
    title: str
    keywords: tuple
    definition: str
    situation: str
    application: str
    condition: str


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def normalize(words):
    text = unicodedata.normalize("NFKD", words.casefold().translate(VI_VARIANTS))
    return " ".join(WORD.findall("".join(
        char for char in text if not unicodedata.combining(char)
    )))


def read_topics(paths):
    courses = {}
    for path in paths:
        course_id = None
        for index, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("@"):
                course_id = line[1:]
                if not course_id or course_id in courses:
                    raise ValueError(f"{path.name}:{index} Mã học phần bị thiếu hoặc trùng.")
                courses[course_id] = []
                continue
            fields = [value.strip() for value in line.split("|")]
            if not course_id or len(fields) != 6 or not all(fields):
                raise ValueError(f"{path.name}:{index} Cần đủ sáu trường cho chủ đề.")
            title, keys, *notes = fields
            keys = tuple(dict.fromkeys(normalize(key) for key in keys.split("/") if key.strip()))
            courses[course_id].append(Topic(title, keys, *notes))
    for course_id, topics in courses.items():
        if len(topics) != 5 or len({topic.title.casefold() for topic in topics}) != 5:
            raise ValueError(f"{course_id} cần đúng năm chủ đề khác nhau.")
    return courses


def course_pages(record, sources):
    for rank, file in enumerate(record["files"]):
        handle_match = re.search(r"_(\d+)\.pdf$", file["file"], re.IGNORECASE)
        handle = handle_match[1] if handle_match else None
        source = sources.get(handle)
        if not source or not source.get("documentId"):
            continue
        for page_index, page in enumerate(file["pages"], 1):
            if page_index > source["pageCount"]:
                break
            if handle in LEGACY_HANDLES:
                page = page.translate(TCVN3_VI)
            folded = normalize(page)
            if len(folded) >= 100:
                yield rank, page_index, page, folded, source


def excerpt_for(page, keyword):
    matches = list(WORD.finditer(page))
    tokens = [normalize(match.group()) for match in matches]
    sequence = keyword.split()
    hit = next((index for index in range(len(tokens)) if tokens[index:index + len(sequence)] == sequence), 0)
    start = matches[max(0, hit - 12)].start()
    end = matches[min(len(matches) - 1, hit + len(sequence) + 35)].end()
    return " ".join(page[start:end].split())[:380]


def locate(topic, pages):
    definition_tokens = {
        word for word in normalize(topic.definition).split() if len(word) >= 4
    }
    best = None
    for rank, page_index, original, text, source in pages:
        padded = " " + text + " "
        for priority, key in enumerate(topic.keywords):
            occurrences = padded.count(" " + key + " ")
            if not occurrences:
                continue
            relevant = len(definition_tokens.intersection(padded.split()))
            score = (
                min(5, len(key.split())) * 5 + (len(topic.keywords) - priority) * 3
                + min(occurrences, 3) * 2 + relevant - rank
                - (8 if page_index < 5 or len(text) < 250 else 0)
                - (8 if "muc luc" in padded or "table of contents" in padded else 0)
            )
            if best is None or score > best[0]:
                best = score, page_index, original, source, key
    if not best:
        return None
    _, page_index, original, source, key = best
    return {
        "documentId": source["documentId"],
        "sourceId": source["id"],
        "page": page_index,
        "url": source["url"],
        "label": source["title"],
        "excerpt": excerpt_for(original, key),
    }


def multiple_choice(question_id, topic_id, source, prompt, correct, alternatives, explanation):
    randomizer = random.Random(hashlib.sha256(question_id.encode()).hexdigest())
    choices = [correct, *randomizer.sample(alternatives, 3)]
    randomizer.shuffle(choices)
    return {
        "id": question_id, "topicId": topic_id, "type": "mcq", "prompt": prompt,
        "options": choices, "answer": choices.index(correct), "explanation": explanation,
        "rubric": [], "source": source,
    }


def generate_questions(course, topics, sources):
    questions = []
    english = course["language"] == "en"
    for index, (topic, source) in enumerate(zip(topics, sources), 1):
        others = [candidate for candidate in topics if candidate != topic]
        topic_id = f"topic-{index}"
        prefix = f"{course['id']}-{topic_id}"
        scenario = topic.situation.rstrip(".") + "."
        if english:
            define = f"Which concept matches this description?\n{topic.definition}."
            apply = f"{scenario}\nWhich response best applies {topic.title.lower()}?"
            check = f"When applying {topic.title.lower()}, which check matters most?"
            essay = (f"{scenario}\nUse {topic.title.lower()} to explain the situation. "
                     "State the reasoning, apply it to the example, and specify one condition for your conclusion.")
        else:
            define = f"Mô tả sau tương ứng với khái niệm nào?\n{topic.definition}."
            apply = f"{scenario}\nĐâu là cách vận dụng phù hợp nhất khi phân tích theo chủ đề «{topic.title}»?"
            check = f"Khi vận dụng «{topic.title}», cần kiểm tra trực tiếp điều nào?"
            essay = (f"{scenario}\nDựa trên «{topic.title}», hãy phân tích tình huống. "
                     "Nêu cơ chế, vận dụng vào ví dụ và chỉ rõ một điều kiện của kết luận.")
        questions.extend([
            multiple_choice(f"{prefix}-concept", topic_id, source, define, topic.title,
                            [other.title for other in others], f"{topic.title} — {topic.definition}."),
            multiple_choice(f"{prefix}-application", topic_id, source, apply, topic.application,
                            [other.application for other in others], f"{topic.application}. {topic.condition}."),
            multiple_choice(f"{prefix}-condition", topic_id, source, check, topic.condition,
                            [other.condition for other in others], f"{topic.condition}."),
            {
                "id": f"{prefix}-essay", "topicId": topic_id, "type": "essay", "prompt": essay,
                "options": [], "answer": None,
                "explanation": f"{topic.definition}. {topic.application}. {topic.condition}.",
                "rubric": [topic.definition, topic.application, topic.condition],
                "source": source,
            },
        ])
    return questions


def build(args):
    catalog = load(args.catalog)
    courses = {course["id"]: course for course in catalog["courses"] if course["hasPdf"]}
    scans = {record["name"]: record for record in load(args.scan)}
    notes = read_topics(args.notes)
    unexpected = sorted(notes.keys() - courses.keys())
    if unexpected:
        raise ValueError("Không tìm thấy học phần có PDF: " + ", ".join(unexpected))
    missing_courses = sorted(courses.keys() - notes.keys())
    if missing_courses and args.full:
        raise ValueError("Thiếu ghi chú học phần: " + ", ".join(missing_courses))
    packs, failures, evidence = [], [], ["# Đối chiếu câu hỏi với trang PDF"]
    for course_id, topics in notes.items():
        course = courses[course_id]
        sources = {
            entry["handle"].rsplit("/", 1)[-1]: entry for entry in course["sources"]
        }
        pages = list(course_pages(scans[course["name"]], sources))
        matches = [locate(topic, pages) for topic in topics]
        for topic, source in zip(topics, matches):
            if not source:
                failures.append(f"{course_id}: {topic.title} ({', '.join(topic.keywords)})")
            else:
                evidence.append(
                    f"- {course_id} · {topic.title} · trang {source['page']} · {source['label']}\n"
                    f"  {source['excerpt']}"
                )
        if all(matches):
            packs.append({
                "courseId": course_id,
                "topics": [{"id": f"topic-{index}", "title": topic.title} for index, topic in enumerate(topics, 1)],
                "questions": generate_questions(course, topics, matches),
            })
    args.evidence.write_text("\n\n".join(evidence) + "\n", encoding="utf-8")
    if failures:
        raise ValueError("Chưa xác định được trang dẫn nguồn:\n" + "\n".join(failures))
    args.output.mkdir(parents=True, exist_ok=True)
    for pack in packs:
        path = args.output / (pack["courseId"] + ".json")
        path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(packs)} học phần, {sum(len(pack['questions']) for pack in packs)} câu. Báo cáo: {args.evidence}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("notes", nargs="+", type=Path)
    parser.add_argument("--catalog", type=Path, default=PRIVATE / "catalog.json")
    parser.add_argument("--scan", type=Path, default=PRIVATE / "corpus-scan.json")
    parser.add_argument("--output", type=Path, default=PRIVATE / "packs")
    parser.add_argument("--evidence", type=Path, default=PRIVATE / "question-evidence.md")
    parser.add_argument("--full", action="store_true")
    args = parser.parse_args()
    try:
        build(args)
    except (ValueError, KeyError, OSError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
