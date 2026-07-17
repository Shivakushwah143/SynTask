from __future__ import annotations

from pymongo import TEXT

from app.models.sales_contact import SalesContact
from app.models.sales_prospect import SalesProspect


def _text_indexes(model):
    return [
        index
        for index in model.Settings.indexes
        if hasattr(index, "document")
        and any(direction == TEXT for _, direction in index.document["key"].items())
    ]


def test_sales_text_indexes_do_not_use_language_field_as_override():
    for model in (SalesContact, SalesProspect):
        indexes = _text_indexes(model)

        assert indexes
        assert all(index.document.get("language_override") == "_text_language" for index in indexes)
