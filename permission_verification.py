"""Permission-letter file validation, text extraction, and evidence checks."""
from datetime import datetime
from difflib import SequenceMatcher
from io import BytesIO
import os
from pathlib import Path
import re


MAX_PERMISSION_FILE_SIZE = 8 * 1024 * 1024
MAX_DOCUMENT_PAGES = 20
MAX_IMAGE_PIXELS = 25_000_000


def validate_permission_file(filename: str, content: bytes) -> tuple[str, str]:
    extension = Path(filename).suffix.lower()
    if extension not in {".pdf", ".jpg", ".jpeg", ".png", ".txt"}:
        raise ValueError("Unsupported file type. Upload a PDF, JPG, JPEG, PNG, or TXT file.")
    if not content:
        raise ValueError("The uploaded permission letter is empty.")
    if len(content) > MAX_PERMISSION_FILE_SIZE:
        raise ValueError("Permission letter must be 8 MB or smaller.")

    if extension == ".txt":
        return "text/plain", ".txt"

    if extension == ".pdf":
        if not content.startswith(b"%PDF-"):
            raise ValueError("The uploaded file does not contain a valid PDF signature.")
        return "application/pdf", ".pdf"

    if extension in {".jpg", ".jpeg"} and not content.startswith(b"\xff\xd8\xff"):
        raise ValueError("The uploaded file does not contain a valid JPEG signature.")
    if extension == ".png" and not content.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("The uploaded file does not contain a valid PNG signature.")

    try:
        from PIL import Image

        with Image.open(BytesIO(content)) as image:
            if image.format not in {"JPEG", "PNG"}:
                raise ValueError("Only JPEG and PNG images are supported.")
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise ValueError("Image dimensions exceed the supported limit.")
            image.verify()
    except ValueError:
        raise
    except Exception as error:
        raise ValueError("The uploaded image could not be decoded.") from error

    return ("image/jpeg", ".jpg") if extension in {".jpg", ".jpeg"} else ("image/png", ".png")


def _ocr_image(image):
    import pytesseract

    try:
        return pytesseract.image_to_string(image)
    except pytesseract.pytesseract.TesseractNotFoundError as error:
        raise RuntimeError(
            "The OCR engine is unavailable. Install Tesseract OCR to verify scanned letters."
        ) from error


def _extract_text(file_path: str, file_type: str) -> tuple[str, list[str]]:
    if file_type == "text/plain" or Path(file_path).suffix.lower() == ".txt":
        text = Path(file_path).read_text(encoding="utf-8", errors="replace")
        return text.strip(), []

    content = Path(file_path).read_bytes()
    risks = []
    if file_type == "application/pdf":
        import fitz

        if re.search(rb"/(?:JavaScript|JS|EmbeddedFile|Launch)\b", content, re.IGNORECASE):
            risks.append("PDF contains active content or embedded files.")
        with fitz.open(stream=content, filetype="pdf") as document:
            if document.is_encrypted:
                return "", [*risks, "Encrypted PDF cannot be inspected."]
            if len(document) == 0 or len(document) > MAX_DOCUMENT_PAGES:
                return "", [*risks, "PDF page count is outside the supported range."]

            page_text = []
            for page in document:
                text = page.get_text("text").strip()
                if len(text) < 30:
                    from PIL import Image
                    import fitz

                    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                    image = Image.open(BytesIO(pixmap.tobytes("png")))
                    text = _ocr_image(image).strip()
                page_text.append(text)
        return "\n".join(page_text).strip(), risks

    from PIL import Image

    with Image.open(file_path) as image:
        if image.width * image.height > MAX_IMAGE_PIXELS:
            return "", [*risks, "Image dimensions exceed the supported limit."]
        return _ocr_image(image).strip(), risks


def _normalize(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", str(value).lower()))


def _line_for_match(expected: str, lines: list[str]) -> str | None:
    normalized_expected = _normalize(expected)
    if not normalized_expected:
        return None
    normalized_all = _normalize("\n".join(lines))
    if normalized_expected in normalized_all:
        return next(
            (line.strip() for line in lines if normalized_expected in _normalize(line)),
            expected,
        )

    expected_tokens = set(normalized_expected.split())
    best_line = None
    best_score = 0.0
    for line in lines:
        normalized_line = _normalize(line)
        if not normalized_line:
            continue
        token_coverage = len(expected_tokens & set(normalized_line.split())) / len(expected_tokens)
        ratio = SequenceMatcher(None, normalized_expected, normalized_line).ratio()
        score = max(token_coverage, ratio)
        if score > best_score:
            best_line, best_score = line.strip(), score
    return best_line if best_score >= 0.86 else None


def _date_values(text: str) -> set[str]:
    date_pattern = re.compile(
        r"\b(?:\d{1,4}[./-]\d{1,2}[./-]\d{2,4}|"
        r"\d{1,2}\s+[A-Za-z]+\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})\b"
    )
    formats = (
        "%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d",
        "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y",
        "%m-%d-%Y", "%m/%d/%Y", "%m.%d.%Y",
        "%d %B %Y", "%d %b %Y", "%B %d %Y", "%B %d, %Y",
        "%b %d %Y", "%b %d, %Y",
    )
    found = set()
    for match in date_pattern.finditer(text):
        candidate = re.sub(r"\s+", " ", match.group(0).replace(",", "")).strip()
        for date_format in formats:
            try:
                found.add(datetime.strptime(candidate, date_format).date().isoformat())
                break
            except ValueError:
                continue
    return found


def _extract_hod_name(lines: list[str]) -> str | None:
    label = re.compile(r"\b(?:HOD|head\s+of\s+department|department\s+head)\b", re.IGNORECASE)
    name_label = re.compile(r"\b(?:HOD|head\s+of\s+department|department\s+head)\s*(?:name)?\s*[:\-]\s*(.+)", re.IGNORECASE)
    for index, line in enumerate(lines):
        match = name_label.search(line)
        if match and _normalize(match.group(1)) not in {"", "signature", "approved"}:
            return match.group(1).strip(" :-\t")[:120]
        if label.search(line):
            for following in lines[index + 1:index + 3]:
                candidate = following.strip(" :-\t")
                if re.search(r"\b(?:Dr|Prof|Professor)\.?\s+\w+", candidate, re.IGNORECASE):
                    return candidate[:120]
    return None


def _event_matches(event, text: str) -> tuple[dict, dict]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    name_line = _line_for_match(event.event_name, lines)
    date_values = _date_values(text)
    try:
        expected_date = datetime.strptime(event.event_date, "%Y-%m-%d").date().isoformat()
    except (TypeError, ValueError):
        expected_date = event.event_date
    date_match = expected_date in date_values
    date_line = next(
        (line for line in lines if any(date_value in _date_values(line) for date_value in {expected_date})),
        None,
    )
    if date_match and date_line is None:
        date_line = expected_date

    matches = {
        "event_name": name_line is not None,
        "event_date": date_match,
        "venue": _line_for_match(event.venue, lines) is not None,
        "department": not event.department or _line_for_match(event.department, lines) is not None,
        "year": not event.year or _line_for_match(event.year, lines) is not None,
    }
    extracted = {
        "event_name": name_line,
        "event_date": date_line,
        "venue": _line_for_match(event.venue, lines),
        "department": _line_for_match(event.department, lines) if event.department else None,
        "year": _line_for_match(event.year, lines) if event.year else None,
    }
    return matches, extracted


def extract_and_verify_permission_letter(event, file_path: str, file_type: str) -> dict:
    try:
        text, risk_signals = _extract_text(file_path, file_type)
    except Exception as error:
        reason = str(error) or "Document could not be processed."
        err_lower = str(error).lower()
        status = "UNABLE_TO_VERIFY" if any(w in err_lower for w in ("ocr", "tesseract", "engine", "decrypt", "encrypted", "unsupported")) else "REJECTED"
        return {
            "status": status,
            "score": 0.0,
            "reason": reason,
            "ocr_text": "",
            "extracted_fields": {},
            "signature_detected": False,
            "signature_status": "Signature Not Detected",
            "event_match": False,
            "hod_details_detected": False,
            "authenticity_status": "Unable to Verify",
            "authenticity_reason": "Document structure and origin could not be assessed.",
            "authenticity_risk": "Document structure and origin could not be assessed.",
            "date_match": False,
            "venue_match": False,
            "department_match": False,
            "year_match": False,
            "hod_approval_detected": False,
            "signature_region_detected": False,
            "matches": {
                "event_name": False,
                "event_date": False,
                "venue": False,
                "department": False,
                "year": False,
            },
        }

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    readable = len(_normalize(text)) >= 30
    matches, extracted = _event_matches(event, text) if readable else ({}, {})
    event_match = bool(matches) and all(matches.values())

    hod_designation = bool(re.search(
        r"\b(?:HOD|head\s+of\s+department|department\s+head)\b", text, re.IGNORECASE
    ))
    hod_name = _extract_hod_name(lines) if hod_designation else None
    registered_names = [
        _normalize(name) for name in re.split(r"[,;|]", os.getenv("CAMPUS_HOD_NAMES", ""))
        if _normalize(name)
    ]
    hod_name_matches_registry = not registered_names or any(
        name in _normalize(hod_name or "") for name in registered_names
    )
    hod_details_detected = bool(hod_designation and hod_name and hod_name_matches_registry)

    approval_detected = bool(re.search(
        r"\b(?:approved|approval|permission\s+(?:is\s+)?granted|authorized|sanctioned)\b",
        text,
        re.IGNORECASE,
    ))
    signature_detected = bool(re.search(
        r"\b(?:signature|signed\s+by|digital\s+signature)\b", text, re.IGNORECASE
    ))
    signature_status = (
        "Signature Verification Uncertain" if signature_detected
        else "Signature Not Detected"
    )
    extracted.update({"hod_name": hod_name, "hod_designation_detected": hod_designation})

    checks = [readable, *matches.values(), hod_details_detected, approval_detected, signature_detected]
    score = round(sum(bool(check) for check in checks) / len(checks) * 100, 1)
    authenticity_status = "Unable to Verify"
    authenticity_reason = (
        "Basic document structure was checked for active content and embedded files. "
        "No selected high-risk indicators were detected; this does not prove authenticity."
    )

    if risk_signals:
        status = "SUSPICIOUS"
        authenticity_reason = " ".join(risk_signals)
        reason = "Potentially unsafe or suspicious document structure detected."
    else:
        failures = []
        if not readable:
            failures.append("Document unreadable or OCR returned no readable text.")
            status = "UNABLE_TO_VERIFY"
            reason = "Document unreadable or OCR returned no readable text."
        else:
            for field, label in (
                ("event_name", "Event name"),
                ("event_date", "Event date"),
                ("venue", "Venue"),
                ("department", "Department"),
                ("year", "Year"),
            ):
                if not matches.get(field, False):
                    failures.append(f"{label} in the letter does not match the event.")
            if not hod_designation:
                failures.append("HOD designation was not detected.")
            elif not hod_name:
                failures.append("HOD name could not be identified.")
            elif not hod_name_matches_registry:
                failures.append("Detected HOD name does not match the configured HOD registry.")
            if not approval_detected:
                failures.append("Permission or approval wording was not detected.")
            if not signature_detected:
                failures.append("Signature or signed-by section was not detected.")
            status = "VERIFIED" if not failures else "REJECTED"
            reason = (
                "Event details matched; HOD details and approval/signature wording were detected. "
                "Signature authenticity and document origin are not independently verified."
                if not failures else " ".join(failures)
            )

    return {
        "status": status,
        "score": score,
        "reason": reason,
        "ocr_text": text[:100_000],
        "extracted_fields": extracted,
        "signature_detected": signature_detected,
        "signature_status": signature_status,
        "event_match": event_match,
        "hod_details_detected": hod_details_detected,
        "authenticity_status": authenticity_status,
        "authenticity_reason": authenticity_reason,
        "authenticity_risk": authenticity_reason,
        "date_match": bool(matches.get("event_date", False)),
        "venue_match": bool(matches.get("venue", False)),
        "department_match": bool(matches.get("department", False)),
        "year_match": bool(matches.get("year", False)),
        "hod_approval_detected": bool(approval_detected),
        "signature_region_detected": bool(signature_detected),
        "matches": matches,
    }