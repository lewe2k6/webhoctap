"""Build the private course catalog, check packs, and prepare a Supabase seed."""

import argparse
from collections import Counter
import json
from pathlib import Path
import sys

from catalog import build_catalog, load_json, write_json
from private_storage import approved_files, verify_approved_objects


PRIVATE = Path(__file__).resolve().parent.parent / ".private"


def scan(source):
    catalog, index, audit = build_catalog(source)
    write_json(PRIVATE / "catalog.json", catalog)
    write_json(PRIVATE / "source-index.json", index)
    write_json(PRIVATE / "catalog-audit.json", audit)
    print(f"{audit['courses']} học phần, {audit['coursesWithPdf']} có PDF, {audit['sourceReferences']} liên kết nguồn")
    print(f"{audit['inputPdfs']} PDF → {audit['canonicalPdfs']} nội dung PDF sau đối chiếu")
    print(f"Danh mục và báo cáo riêng tại {PRIVATE}")


def nonblank(value):
    return isinstance(value, str) and bool(value.strip())


def validate_packs(catalog, files, require_full):
    local_courses = {course["id"]: course for course in catalog["courses"] if course["hasPdf"]}
    packs = {}
    for path in files:
        pack = load_json(path)
        course_id = pack.get("courseId")
        if course_id not in local_courses or course_id in packs:
            raise ValueError(f"Học phần bị lặp hoặc chưa có PDF: {path.name}")
        topics = pack.get("topics") or []
        topic_ids = [topic.get("id") for topic in topics]
        if (not topic_ids or len(set(topic_ids)) != len(topic_ids) or not all(
                nonblank(topic.get("id")) and nonblank(topic.get("title")) for topic in topics)):
            raise ValueError(f"Chủ đề thiếu, trùng hoặc sai định dạng: {path.name}")

        questions = pack.get("questions") or []
        counts = Counter(question.get("type") for question in questions)
        if counts != {"mcq": 15, "essay": 5}:
            raise ValueError(f"{path.name} cần đúng 15 câu trắc nghiệm và 5 câu tự luận, đang có {dict(counts)}")
        seen_ids = set()
        seen_prompts = set()
        course_sources = local_courses[course_id]["sources"]
        for question in questions:
            validate_question(question, topic_ids, course_sources, path.name)
            question_id = question["id"]
            prompt = " ".join(question["prompt"].split()).casefold()
            if question_id in seen_ids or prompt in seen_prompts:
                raise ValueError(f"{path.name} có câu hỏi trùng: {question_id}")
            seen_ids.add(question_id)
            seen_prompts.add(prompt)
        packs[course_id] = pack

    if require_full:
        missing = sorted(set(local_courses) - set(packs))
        if missing:
            raise ValueError("Chưa đủ bộ câu hỏi cho các môn: " + ", ".join(missing))
    return packs


def validate_question(question, topic_ids, course_sources, filename):
    question_id = question.get("id")
    location = f"{filename} / {question_id}"
    if (not nonblank(question_id) or question.get("topicId") not in topic_ids
            or not all(nonblank(question.get(field)) for field in ("prompt", "explanation"))):
        raise ValueError(f"Câu hỏi thiếu nội dung hoặc chủ đề: {location}")

    if question["type"] == "mcq":
        options = question.get("options")
        answer = question.get("answer")
        if (not isinstance(options, list) or len(options) != 4 or not all(nonblank(option) for option in options)
                or len({option.strip().casefold() for option in options}) != 4
                or type(answer) is not int or not 0 <= answer < 4):
            raise ValueError(f"Câu trắc nghiệm cần bốn lựa chọn riêng và chỉ số đáp án 0–3: {location}")
    else:
        rubric = question.get("rubric")
        if not isinstance(rubric, list) or not rubric or not all(nonblank(criterion) for criterion in rubric):
            raise ValueError(f"Câu tự luận thiếu tiêu chí tự chấm: {location}")

    source = question.get("source") or {}
    destinations = [entry for entry in course_sources if entry.get("documentId") == source.get("documentId")]
    if source.get("sourceId"):
        destinations = [entry for entry in destinations if entry["id"] == source["sourceId"]]
    if source.get("url"):
        destinations = [entry for entry in destinations if entry["url"] == source["url"]]
    page = source.get("page")
    if not destinations or type(page) is not int or not any(1 <= page <= entry.get("pageCount", 0) for entry in destinations):
        raise ValueError(f"Câu hỏi trỏ tới tài liệu hoặc trang PDF ngoài học phần: {location}")


def sql_literal(value):
    return "'" + value.replace("'", "''") + "'"


def sql_json(value):
    return sql_literal(json.dumps(value, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def seed_sql(catalog, packs, objects):
    lines = ["begin;", "set local standard_conforming_strings = on;"]
    lines.append(f"insert into public.study_catalog (id, data) values (1, {sql_json(catalog)})\n"
                 "on conflict (id) do update set data = excluded.data;")
    for course_id, pack in sorted(packs.items()):
        lines.append(f"insert into public.study_packs (course_id, data) values ({sql_literal(course_id)}, {sql_json(pack)})\n"
                     "on conflict (course_id) do update set data = excluded.data;")

    if objects is not None:
        approved_literals = ", ".join(sql_literal(document_id) for document_id in sorted(objects))
        remove_stale = f" where document_id not in ({approved_literals})" if approved_literals else ""
        lines.append(f"delete from public.study_documents{remove_stale};")
        for document_id, key in sorted(objects.items()):
            lines.append(f"insert into public.study_documents (document_id, object_key)\n"
                         f"values ({sql_literal(document_id)}, {sql_literal(key)})\n"
                         "on conflict (document_id) do update set object_key = excluded.object_key;")
    lines.append("commit;")
    return "\n\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    scan_command = commands.add_parser("scan", help="Đối chiếu PDF với danh mục và gộp trùng tại máy")
    scan_command.add_argument("--source", required=True, type=Path)
    upload_command = commands.add_parser("r2-upload", help="Tải riêng các PDF đã duyệt lên kho R2")
    upload_command.add_argument("--rights", required=True, type=Path)
    upload_command.add_argument("--dry-run", action="store_true", help="Chỉ đối chiếu phê duyệt với PDF cục bộ")
    seed_command = commands.add_parser("seed-sql", help="Tạo SQL nhập dữ liệu học tại .private/seed.sql")
    seed_command.add_argument("--packs", type=Path, help="Thư mục các bộ câu hỏi JSON")
    seed_command.add_argument("--rights", type=Path, help="Đối chiếu danh sách PDF riêng với R2")
    seed_command.add_argument("--full", action="store_true", help="Kiểm tra đủ bộ câu hỏi cho tất cả môn có PDF")
    args = parser.parse_args()

    if args.command == "scan":
        scan(args.source)
        return

    if args.command == "r2-upload":
        approved = approved_files(args.rights, load_json(PRIVATE / "source-index.json"))
        if args.dry_run:
            print(f"{len(approved)} PDF khớp tệp duyệt. Chưa gọi R2.")
        else:
            verified = verify_approved_objects(approved, upload=True)
            print(f"{len(verified)} PDF đã xác minh trên kho R2")
        return

    catalog = load_json(PRIVATE / "catalog.json")
    if args.packs and not args.packs.is_dir():
        raise ValueError(f"Không tìm thấy thư mục bộ câu hỏi: {args.packs}")
    files = sorted(args.packs.glob("*.json")) if args.packs else []
    packs = validate_packs(catalog, files, args.full)
    objects = None
    if args.rights:
        approved = approved_files(args.rights, load_json(PRIVATE / "source-index.json"))
        objects = verify_approved_objects(approved)
    seed_path = PRIVATE / "seed.sql"
    temporary = seed_path.with_suffix(".sql.tmp")
    temporary.write_text(seed_sql(catalog, packs, objects), encoding="utf-8")
    temporary.replace(seed_path)
    print(f"{len(packs)} bộ, {sum(len(pack['questions']) for pack in packs.values())} câu vào {seed_path}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        sys.exit(str(error))
