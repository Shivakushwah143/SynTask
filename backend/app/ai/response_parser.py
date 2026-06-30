from __future__ import annotations

import json
import re
from typing import TypeVar

from pydantic import BaseModel, ValidationError


T = TypeVar("T", bound=BaseModel)


class ResponseParser:
    @staticmethod
    def extract_json_block(raw_content: str) -> str:
        content = raw_content.strip()
        fenced = re.search(r"```(?:json)?\s*(.*?)```", content, re.DOTALL | re.IGNORECASE)
        if fenced:
            return fenced.group(1).strip()
        return content

    @classmethod
    def parse_json_model(cls, raw_content: str, model: type[T]) -> T:
        extracted = cls.extract_json_block(raw_content)
        parsed = json.loads(extracted)
        return model.model_validate(parsed)

    @staticmethod
    def validate_or_raise(raw_content: str) -> dict:
        extracted = ResponseParser.extract_json_block(raw_content)
        return json.loads(extracted)

    @staticmethod
    def format_validation_error(error: ValidationError) -> str:
        return "; ".join(f"{item['loc']}: {item['msg']}" for item in error.errors())

