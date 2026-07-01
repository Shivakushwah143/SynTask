from __future__ import annotations

from typing import Any


class EmotionTemplates:
    _TEMPLATES: dict[str, dict[str, Any]] = {
        "burnout_risk": {
            "tone": "supportive, calm, and low-pressure",
            "prefix": "You seem overloaded, so let’s keep this small and manageable.",
            "suggestions": [
                "Focus on the single highest-impact task first.",
                "Break the next step into a 15-minute action.",
                "If possible, defer non-urgent work and protect a short break.",
            ],
        },
        "stressed": {
            "tone": "reassuring, clear, and structured",
            "prefix": "It looks like things are feeling heavy right now, so I’ll keep this crisp.",
            "suggestions": [
                "Triage urgent work before anything else.",
                "Remove one blocker before starting new work.",
                "Use a short checklist instead of a broad plan.",
            ],
        },
        "overwhelmed": {
            "tone": "calm, concise, and grounding",
            "prefix": "There is a lot in motion, so I’ll narrow this to the essentials.",
            "suggestions": [
                "Identify the top one or two outcomes for today.",
                "Avoid switching between too many tasks.",
                "Escalate blockers early instead of absorbing them.",
            ],
        },
        "focused": {
            "tone": "direct, efficient, and confident",
            "prefix": "You look in a good execution rhythm, so I’ll keep this action-oriented.",
            "suggestions": [
                "Keep momentum on the current priority lane.",
                "Close one meaningful item before expanding scope.",
                "Capture the next follow-up immediately after finishing.",
            ],
        },
        "productive": {
            "tone": "positive, concise, and outcome-driven",
            "prefix": "You have a solid pace right now, so I’ll keep the guidance tight.",
            "suggestions": [
                "Use your momentum on the next high-value task.",
                "Batch small follow-ups together.",
                "Commit to a clear finish line before the next switch.",
            ],
        },
        "neutral": {
            "tone": "friendly, practical, and balanced",
            "prefix": "I’ll keep this practical and based on your current context.",
            "suggestions": [
                "Start with the most urgent open item.",
                "Keep an eye on any blockers or overdue work.",
                "Use the next step that gives the highest leverage.",
            ],
        },
    }

    @classmethod
    def normalize_mood(cls, mood: str | None) -> str:
        key = (mood or "neutral").strip().lower()
        if key in cls._TEMPLATES:
            return key
        if key in {"burned_out", "burned-out", "exhausted"}:
            return "burnout_risk"
        if key in {"busy", "anxious", "tense"}:
            return "stressed"
        if key in {"calm", "steady"}:
            return "neutral"
        return "neutral"

    @classmethod
    def get_profile(cls, mood: str | None) -> dict[str, Any]:
        key = cls.normalize_mood(mood)
        template = cls._TEMPLATES.get(key, cls._TEMPLATES["neutral"])
        return {
            "mood": key,
            "tone": template["tone"],
            "prefix": template["prefix"],
            "suggestions": list(template["suggestions"]),
        }

    @classmethod
    def build_tone_guidance(cls, emotional_state: dict[str, Any] | None) -> dict[str, Any]:
        state = emotional_state or {}
        profile = cls.get_profile(state.get("mood"))
        stress_level = float(state.get("stress_level") or 0.0)
        productivity_level = float(state.get("productivity_level") or 0.0)
        burnout_risk = float(state.get("burnout_risk") or 0.0)

        if burnout_risk >= 0.75:
            profile = cls.get_profile("burnout_risk")
        elif stress_level >= 0.7:
            profile = cls.get_profile("stressed")
        elif productivity_level >= 0.7 and stress_level <= 0.4:
            profile = cls.get_profile("productive")
        elif productivity_level >= 0.55:
            profile = cls.get_profile("focused")

        profile["stress_level"] = stress_level
        profile["productivity_level"] = productivity_level
        profile["burnout_risk"] = burnout_risk
        return profile

    @classmethod
    def apply_tone(cls, message: str, emotional_state: dict[str, Any] | None) -> str:
        guidance = cls.build_tone_guidance(emotional_state)
        prefix = guidance.get("prefix")
        if not prefix:
            return message
        if message.startswith(prefix):
            return message
        return f"{prefix} {message}".strip()
