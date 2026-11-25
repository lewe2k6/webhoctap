"""Reconcile the local TMU metadata and PDF corpus without altering the source."""

from collections import defaultdict
from contextlib import closing
import hashlib
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit
from uuid import UUID

from pypdfium2 import PdfDocument


REFERENCE_GROUPS = ("textbooks", "slides", "syllabi")
ENGLISH_NAMES = {
    "business economics", "economics", "macroeconomics 1", "macroeconomics 2",
    "managerial economics", "microeconomics 1",
}

# Identical teaching pages validated against the November 2026 local corpus.
# Match reviewed bytes and physical page counts so a replacement edition
# is always reconsidered independently. Keep the first digest as the reader copy.
REVIEWED_EQUIVALENCES = (
    (
        "983d72f43ba3d3a310bbabda8d68a45de6b99c1059890a79aef115b4d9cd33cb",
        "cf225ee8b870a3bb33c4ebf73d070c3183dde5f70b64acfe0f83c25dced6ee5a",
        121,
    ),
    (
        "9914840549a2dc437f4a159ab76ab5fc4c0a98ae38844374c3d7b895953dfb92",
        "e8c80b0ff23c33ff0c78f6edf634def2b46b99515c91a5d9362341558c60f099",
        345,
    ),
    (
        "cc583822f3dbfbeb37c9fc9720d55b2553a8f0e9fba27c62d19fa7de4d43f0ec",
        "c91f5ccc2b4f86e77783d0a60238ade942c73d89d682b9459a485649d17ee533",
        360,
    ),
    (
        "b1f280dd774d7d407f747261900eedbdd07c15c59faa06f4a79f7d1df4706908",
        "1b1f89d4dc26932772f6afabe1248a9c57f66c10aff35fd31079882cdcbf2c5d",
        159,
    ),
    (
        "d6d24e959d063eeca8e2d3ed784cd462201b63e52244c54f13a812fa4da875dd",
        "0ff682a711b9cb43920fd19285d659d1dc5e1ec09b2a04b0bdc43a519502a8ce",
        101,
    ),
)


def load_json(path):
    with path.open(encoding="utf-8-sig") as stream:
        return json.load(stream)


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def search_key(value):
    value = unicodedata.normalize("NFKD", value.casefold().replace("đ", "d"))
    return "".join(char for char in value if not unicodedata.combining(char))


def name_key(value):
    return unicodedata.normalize("NFC", value).casefold().strip()


def course_codes(course):
    return re.findall(r"[A-Z]+\d+", course["code"].upper())


def reference_kind(group, ref):
    if group == "slides":
        return "slide"
    if group == "syllabi":
        return "syllabus"
    if ref.get("isOfficialTextbook") or name_key(ref["name"]).startswith("giáo trình"):
        return "textbook"
    if name_key(ref["name"]).startswith("đề cương"):
        return "outline"
    return "lecture"


def index_pdfs(root):
    files = {}
    by_digest = defaultdict(list)
    by_folder_handle = {}
    for path in sorted(root.rglob("*.pdf")):
        resolved = path.resolve(strict=True)
        if not resolved.is_relative_to(root):
            raise ValueError(f"PDF nằm ngoài thư mục nguồn: {path}")
        relative = path.relative_to(root).as_posix()
        digest = sha256(path)
        with closing(PdfDocument(path)) as document:
            pages = len(document)
        files[relative] = {"sha256": digest, "pageCount": pages, "bytes": path.stat().st_size}
        by_digest[digest].append(relative)
        match = re.search(r"_(\d+)\.pdf$", path.name, re.IGNORECASE)
        if match:
            key = (path.parent.relative_to(root).as_posix(), match[1])
            if key in by_folder_handle:
                raise ValueError(f"Nhiều PDF khớp cùng thư mục và Handle: {relative}")
            by_folder_handle[key] = relative
    return files, by_digest, by_folder_handle


def build_catalog(root):
    root = root.resolve(strict=True)
    entries = load_json(root / "courses.json")
    bitstreams = load_json(root / "bitstreams-cache.json")
    files, by_digest, by_handle = index_pdfs(root)
    canonical_for = {digest: digest for digest in by_digest}
    equivalents = []
    for canonical, alias, pages in REVIEWED_EQUIVALENCES:
        if canonical not in by_digest or alias not in by_digest:
            continue
        if any(files[by_digest[digest][0]]["pageCount"] != pages for digest in (canonical, alias)):
            continue
        canonical_for[alias] = canonical
        equivalents.append({"canonical": canonical, "alias": alias, "pageCount": pages})

    by_name = defaultdict(list)
    for entry in entries:
        by_name[name_key(entry["name"])].append(entry)

    courses = []
    matched_paths = set()
    matched_digests = set()
    source_locations = {}
    for normalized_name, group in by_name.items():
        primary = next((entry for entry in group if course_codes(entry)), group[0])
        name = unicodedata.normalize("NFC", primary["name"])
        codes = list(dict.fromkeys(code for entry in [primary, *group] for code in course_codes(entry)))
        course_id = codes[0].lower() if codes else re.sub(r"[^a-z0-9]+", "-", search_key(name)).strip("-")
        sources = {}
        for entry in [primary, *(entry for entry in group if entry is not primary)]:
            for ref_group in REFERENCE_GROUPS:
                for ref in entry[ref_group]:
                    source_id = str(UUID(ref["uuid"]))
                    parsed_url = urlsplit(ref["url"])
                    if parsed_url.scheme != "https" or parsed_url.netloc != "dlib.tmu.edu.vn":
                        raise ValueError(f"URL tài liệu ngoài danh mục TMU: {ref['url']}")
                    source = {
                        "id": source_id, "title": unicodedata.normalize("NFC", ref["name"]),
                        "kind": reference_kind(ref_group, ref), "handle": ref["handle"],
                        "url": ref["url"],
                    }
                    handle = ref["handle"].rsplit("/", 1)[-1]
                    location = by_handle.get((entry["folderName"], handle))
                    if location:
                        raw_file = files[location]
                        digest = raw_file["sha256"]
                        source.update(documentId=canonical_for[digest], pageCount=raw_file["pageCount"])
                        if digest != canonical_for[digest]:
                            source["variant"] = "Nội dung giảng dùng chung với một phiên bản khác"
                        matched_digests.add(digest)
                        matched_paths.add(location)
                        source_locations[source_id] = {
                            "path": location, "sha256": digest, "bitstreamId": bitstreams.get(source_id),
                        }
                    sources.setdefault(source_id, source)

        primary_sources = {}
        # Prefer the exact copy matching the reader PDF over an equivalent edition.
        for source in sorted(sources.values(), key=lambda item: source_locations.get(item["id"], {}).get("sha256") != item.get("documentId")):
            document_id = source.get("documentId")
            if not document_id:
                continue
            if document_id in primary_sources:
                source["duplicateOf"] = primary_sources[document_id]
            else:
                primary_sources[document_id] = source["id"]

        courses.append({
            "id": course_id, "name": name, "codes": codes,
            "language": "en" if normalized_name in ENGLISH_NAMES else "vi",
            "hasPdf": bool(primary_sources), "sources": list(sources.values()),
        })

    identifiers = [course["id"] for course in courses]
    if len(identifiers) != len(set(identifiers)):
        raise ValueError("Có mã học phần bị trùng sau khi chuẩn hóa")
    outside_metadata = sorted(set(files) - matched_paths)
    unmatched = [path for path in outside_metadata if files[path]["sha256"] not in matched_digests]
    if unmatched:
        raise ValueError("Có PDF riêng chưa khớp metadata. Kiểm tra trước khi nhập:\n" + "\n".join(unmatched))

    document_ids = sorted({canonical_for[digest] for digest in matched_digests})
    reader_files = {}
    documents = []
    for document_id in document_ids:
        relative = by_digest[document_id][0]
        reader_files[document_id] = {"path": relative, **files[relative]}
        documents.append({
            "id": document_id, "pdfSha256": document_id,
            "pageCount": files[relative]["pageCount"],
        })

    catalog = {"courses": courses, "documents": documents}
    index = {"sourceRoot": str(root), "readerFiles": reader_files, "sourceFiles": source_locations}
    audit = {
        "inputCourses": len(entries), "courses": len(courses),
        "coursesWithPdf": sum(course["hasPdf"] for course in courses),
        "sourceReferences": sum(len(course["sources"]) for course in courses),
        "inputPdfs": len(files), "inputPdfBytes": sum(file["bytes"] for file in files.values()),
        "canonicalPdfs": len(documents), "byteDuplicatePaths": [paths for paths in by_digest.values() if len(paths) > 1],
        "reviewedEquivalentPdfs": equivalents, "unlistedByteDuplicates": outside_metadata,
    }
    return catalog, index, audit
