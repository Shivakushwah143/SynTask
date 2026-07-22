from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.files import resolve_upload_path, serve_upload_file


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


def test_serve_upload_file_reads_avatar_from_upload_root(tmp_path):
    avatar_dir = tmp_path / "uploads" / "avatars"
    avatar_dir.mkdir(parents=True)
    avatar = avatar_dir / "profile.jpg"
    avatar.write_bytes(b"avatar")

    response = serve_upload_file(avatar_dir, "profile.jpg")

    assert Path(response.path) == avatar.resolve()
