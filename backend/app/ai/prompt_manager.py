from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.ai.role_engine import RoleResolution


@dataclass(slots=True)
class PromptPackage:
    role_key: str
    prompt_role_key: str
    prompt_version: str
    prompt_file: str
    fallback_chain: list[str]
    fallback_used: bool
    fallback_reason: str | None
    system_prompt: str
    user_prompt: str


class PromptManager:
    def __init__(self, prompt_dir: Path | None = None) -> None:
        self.prompt_dir = prompt_dir or Path(__file__).parent / "prompts"

    def load_role_template(self, role_key: str) -> dict[str, Any]:
        template_path = self.prompt_dir / f"{role_key}.json"
        if not template_path.exists():
            raise FileNotFoundError(f"Prompt template not found: {template_path}")
        return json.loads(template_path.read_text(encoding="utf-8"))

    def _load_chat_template(self, role_key: str) -> dict[str, Any]:
        template_path = self.prompt_dir / "chat" / f"{role_key}.json"
        if template_path.exists():
            return json.loads(template_path.read_text(encoding="utf-8"))
        raise FileNotFoundError(f"Chat prompt template not found: {template_path}")

    def _load_feature_template(self, feature_name: str, role_key: str) -> dict[str, Any]:
        template_path = self.prompt_dir / feature_name / f"{role_key}.json"
        if template_path.exists():
            return json.loads(template_path.read_text(encoding="utf-8"))
        raise FileNotFoundError(f"Feature prompt template not found: {template_path}")

    def _resolve_template(self, resolution: RoleResolution) -> tuple[str, dict[str, Any]]:
        candidates: list[str] = []
        for role_key in [resolution.role_key, *resolution.fallback_chain]:
            if role_key not in candidates:
                candidates.append(role_key)

        last_error: FileNotFoundError | None = None
        for role_key in candidates:
            try:
                return role_key, self.load_role_template(role_key)
            except FileNotFoundError as error:
                last_error = error

        raise last_error or FileNotFoundError(f"Prompt template not found for role: {resolution.role_key}")

    def render_role_prompt(
        self,
        resolution: RoleResolution,
        *,
        feature_name: str,
        context: dict[str, Any],
        output_schema: dict[str, Any],
    ) -> PromptPackage:
        prompt_role_key, template = self._resolve_template(resolution)
        prompt_file = f"{prompt_role_key}.json"
        fallback_chain = list(dict.fromkeys(template.get("fallback_chain") or resolution.fallback_chain))
        fallback_used = resolution.fallback_used or prompt_role_key != resolution.role_key

        return PromptPackage(
            role_key=resolution.role_key,
            prompt_role_key=f"{feature_name}-{prompt_role_key}",
            prompt_version=str(template.get("version") or resolution.prompt_version),
            prompt_file=prompt_file,
            fallback_chain=fallback_chain,
            fallback_used=fallback_used,
            fallback_reason=resolution.fallback_reason,
            system_prompt=template["system"].format(
                role_label=template.get("role_label", resolution.role_key.replace("_", " ").title()),
                feature_name=feature_name,
                prompt_version=str(template.get("version") or resolution.prompt_version),
                fallback_chain=", ".join(fallback_chain) if fallback_chain else "none",
            ),
            user_prompt=template["user"].format(
                feature_name=feature_name,
                context_json=json.dumps(context, indent=2, default=str),
                output_schema_json=json.dumps(output_schema, indent=2, default=str),
                role_label=template.get("role_label", resolution.role_key.replace("_", " ").title()),
                prompt_version=str(template.get("version") or resolution.prompt_version),
            ),
        )

    def render_chat_prompt(
        self,
        resolution: RoleResolution,
        *,
        context: dict[str, Any],
        output_schema: dict[str, Any],
    ) -> PromptPackage:
        candidates: list[str] = []
        for role_key in [resolution.role_key, *resolution.fallback_chain]:
            if role_key not in candidates:
                candidates.append(role_key)

        last_error: FileNotFoundError | None = None
        template: dict[str, Any] | None = None
        prompt_role_key = resolution.role_key
        for role_key in candidates:
            try:
                template = self._load_chat_template(role_key)
                prompt_role_key = role_key
                break
            except FileNotFoundError as error:
                last_error = error

        if template is None:
            raise last_error or FileNotFoundError(f"Chat prompt template not found for role: {resolution.role_key}")

        fallback_chain = list(dict.fromkeys(template.get("fallback_chain") or resolution.fallback_chain))
        fallback_used = resolution.fallback_used or prompt_role_key != resolution.role_key

        return PromptPackage(
            role_key=resolution.role_key,
            prompt_role_key=f"chat-{prompt_role_key}",
            prompt_version=str(template.get("version") or resolution.prompt_version),
            prompt_file=f"chat/{prompt_role_key}.json",
            fallback_chain=fallback_chain,
            fallback_used=fallback_used,
            fallback_reason=resolution.fallback_reason,
            system_prompt=template["system"].format(
                role_label=template.get("role_label", resolution.role_key.replace("_", " ").title()),
                prompt_version=str(template.get("version") or resolution.prompt_version),
                fallback_chain=", ".join(fallback_chain) if fallback_chain else "none",
            ),
            user_prompt=template["user"].format(
                context_json=json.dumps(context, indent=2, default=str),
                output_schema_json=json.dumps(output_schema, indent=2, default=str),
                role_label=template.get("role_label", resolution.role_key.replace("_", " ").title()),
                prompt_version=str(template.get("version") or resolution.prompt_version),
            ),
        )

    def render_feature_prompt(
        self,
        resolution: RoleResolution,
        *,
        feature_name: str,
        context: dict[str, Any],
        output_schema: dict[str, Any],
    ) -> PromptPackage:
        candidates: list[str] = []
        for role_key in [resolution.role_key, *resolution.fallback_chain]:
            if role_key not in candidates:
                candidates.append(role_key)

        last_error: FileNotFoundError | None = None
        template: dict[str, Any] | None = None
        prompt_role_key = resolution.role_key
        for role_key in candidates:
            try:
                template = self._load_feature_template(feature_name, role_key)
                prompt_role_key = role_key
                break
            except FileNotFoundError as error:
                last_error = error

        if template is None:
            raise last_error or FileNotFoundError(
                f"Feature prompt template not found for {feature_name}: {resolution.role_key}"
            )

        fallback_chain = list(dict.fromkeys(template.get("fallback_chain") or resolution.fallback_chain))
        fallback_used = resolution.fallback_used or prompt_role_key != resolution.role_key

        return PromptPackage(
            role_key=resolution.role_key,
            prompt_role_key=f"{feature_name}-{prompt_role_key}",
            prompt_version=str(template.get("version") or resolution.prompt_version),
            prompt_file=f"{feature_name}/{prompt_role_key}.json",
            fallback_chain=fallback_chain,
            fallback_used=fallback_used,
            fallback_reason=resolution.fallback_reason,
            system_prompt=template["system"].format(
                role_label=template.get("role_label", resolution.role_key.replace("_", " ").title()),
                feature_name=feature_name,
                prompt_version=str(template.get("version") or resolution.prompt_version),
                fallback_chain=", ".join(fallback_chain) if fallback_chain else "none",
            ),
            user_prompt=template["user"].format(
                feature_name=feature_name,
                context_json=json.dumps(context, indent=2, default=str),
                output_schema_json=json.dumps(output_schema, indent=2, default=str),
                role_label=template.get("role_label", resolution.role_key.replace("_", " ").title()),
                prompt_version=str(template.get("version") or resolution.prompt_version),
            ),
        )
