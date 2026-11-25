"""Extract text from three representative source PDFs per course for private authoring."""

import argparse
from contextlib import closing
import json
from pathlib import Path
import unicodedata

import pypdfium2 as pdf


def read_page(document, index):
    with closing(document[index]) as page, closing(page.get_textpage()) as text:
        return unicodedata.normalize("NFC", text.get_text_bounded()).replace("\u00ad", "")


def rank_file(path):
    with pdf.PdfDocument(path) as document:
        count = len(document)
        first = "".join(read_page(document, index) for index in range(min(count, 5)))
    legibility = sum(letter in first for letter in "ệọựưếộô")
    teaching = 8 if "giáo trình" in path.name.casefold() else 0
    return teaching + legibility + min(count, 260) / 70, count, path


def read_course(course, source):
    paths = list((source / course["folderName"]).glob("*.pdf"))
    if not paths:
        return None
    files = []
    for _, _, path in sorted(map(rank_file, paths), reverse=True)[:3]:
        with pdf.PdfDocument(path) as document:
            pages = [read_page(document, index) for index in range(len(document))]
        files.append({"file": str(path.relative_to(source)), "pages": pages})
    return {"name": course["name"], "code": course["code"], "files": files}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", default=".private/corpus-scan.json", type=Path)
    options = parser.parse_args()
    courses = json.loads((options.source / "courses.json").read_text(encoding="utf-8-sig"))
    records = []
    for course in courses:
        record = read_course(course, options.source)
        if record:
            records.append(record)
    options.output.parent.mkdir(parents=True, exist_ok=True)
    options.output.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
    print(f"{len(records)} courses saved to {options.output}")


if __name__ == "__main__":
    main()
