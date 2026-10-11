"""Plain-text extraction for uploaded files."""

from __future__ import annotations

import io

from docx import Document as DocxDocument
from pypdf import PdfReader

MAX_UPLOAD_BYTES = 20 * 1024 * 1024

# MIME type -> extension used when the browser sends a generic type.
SUPPORTED = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "text/csv": ".csv",
}
SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".markdown", ".csv"}


class UnsupportedFileError(ValueError):
    pass


def extract_text(filename: str, mime_type: str | None, data: bytes) -> str:
    """Return the file's text. Raises UnsupportedFileError for other formats."""
    extension = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in SUPPORTED_EXTENSIONS and (mime_type or "") not in SUPPORTED:
        raise UnsupportedFileError("Supported files: PDF, DOCX, TXT, Markdown, CSV.")

    if extension == ".pdf" or mime_type == "application/pdf":
        reader = PdfReader(io.BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n\n".join(p.strip() for p in pages if p.strip())
    if extension == ".docx" or (mime_type or "").endswith("wordprocessingml.document"):
        doc = DocxDocument(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    return data.decode("utf-8", errors="replace")
