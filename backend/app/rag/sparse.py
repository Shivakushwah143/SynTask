from __future__ import annotations

import hashlib
import math
import re
from collections import Counter

TOKEN_RE = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9_-]*")
SPARSE_HASH_BUCKETS = 2_000_003


class SparseHashEncoder:
    version = "sparse-hash-v1"

    def encode(self, text: str) -> dict[str, list[int] | list[float]]:
        tokens = [token.lower() for token in TOKEN_RE.findall(text or "")]
        counts = Counter(tokens)
        if not counts:
            return {"indices": [], "values": []}
        norm = math.sqrt(sum(value * value for value in counts.values())) or 1.0
        pairs = []
        for token, count in counts.items():
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:8], "big") % SPARSE_HASH_BUCKETS
            pairs.append((index, float(count) / norm))
        pairs.sort(key=lambda item: item[0])
        return {"indices": [index for index, _ in pairs], "values": [value for _, value in pairs]}
