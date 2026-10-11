from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.core.background import spawn_background
from app.api.v1.documents.extract import MAX_UPLOAD_BYTES, UnsupportedFileError, extract_text
from app.api.v1.documents.store import (
    DocumentInfo,
    create_upload,
    delete_upload,
    ingest_upload,
    list_uploads,
)

documents_router = APIRouter(prefix="/documents", tags=["Documents"])

ClientId = Annotated[UUID, Header(alias="X-Client-Id")]


def _serialize(doc: DocumentInfo) -> dict:
    return {
        "id": str(doc.id),
        "title": doc.title,
        "mime_type": doc.mime_type,
        "size_bytes": doc.size_bytes,
        "status": doc.status,
        "error": doc.error,
        "chunk_count": doc.chunk_count,
        "created_at": doc.created_at.isoformat(),
    }


@documents_router.post("", status_code=202)
async def upload_document(file: UploadFile, client_id: ClientId):
    """Upload a file for RAG. Text is extracted now; embedding runs in the
    background — poll GET /documents?ids=… until status is `ready`."""
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Files can be up to 20 MB.")
    filename = file.filename or "Untitled"
    try:
        content = await run_in_threadpool(extract_text, filename, file.content_type, data)
    except UnsupportedFileError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Couldn't read this file.") from exc
    if not content.strip():
        raise HTTPException(
            status_code=422,
            detail="No readable text found. Scanned PDFs need OCR, which isn't supported yet.",
        )

    doc = await create_upload(
        client_id, filename, file.content_type or "application/octet-stream", len(data)
    )
    spawn_background(ingest_upload(doc.id, content))
    return _serialize(doc)


@documents_router.get("")
async def get_documents(
    client_id: ClientId, ids: Annotated[list[UUID] | None, Query()] = None
):
    """The caller's uploads, newest first (optionally only `ids`)."""
    return {"documents": [_serialize(d) for d in await list_uploads(client_id, ids)]}


@documents_router.delete("/{document_id}", status_code=204)
async def remove_document(document_id: UUID, client_id: ClientId):
    if not await delete_upload(client_id, document_id):
        raise HTTPException(status_code=404, detail="Document not found")

