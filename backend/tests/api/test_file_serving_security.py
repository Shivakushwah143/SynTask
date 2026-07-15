from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.files import resolve_upload_path


def test_resolve_upload_path_rejects_directory_traversal(tmp_path):
    with pytest.raises(HTTPException) as exc:
        resolve_upload_path(tmp_path, "../secret.txt")

    assert exc.value.status_code == 400


def test_resolve_upload_path_keeps_files_inside_upload_root(tmp_path):
    upload_root = tmp_path / "uploads"
    file_path = upload_root / "clients" / "contract.pdf"
    file_path.parent.mkdir(parents=True)
    file_path.write_text("contract")

    resolved = resolve_upload_path(upload_root, "clients/contract.pdf")

    assert resolved == file_path.resolve()
