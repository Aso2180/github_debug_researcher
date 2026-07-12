"""Anthropic Messages APIクライアント(Python版)

server/src/services/anthropicClient.jsと同じモデル(claude-sonnet-5)を使う。
`anthropic`パッケージは追加せず、既存のgithub_client.py/qiita_client.pyと同じ
requests直叩きスタイルで統一する。
"""
import json
import re

import requests

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
ANTHROPIC_MODEL = "claude-sonnet-5"


def _strip_code_fence(text: str) -> str:
    """server/src/routes/analyze.jsのstripCodeFence()と同じ考え方でコードフェンスを除去する"""
    trimmed = text.strip()
    match = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", trimmed, re.IGNORECASE)
    return match.group(1).strip() if match else trimmed


class AnthropicClient:
    def __init__(self, api_key: str, session: requests.Session | None = None):
        self.api_key = api_key
        self.session = session or requests.Session()

    def _send(self, prompt: str) -> str:
        resp = self.session.post(
            ANTHROPIC_API_URL,
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": ANTHROPIC_VERSION,
                "content-type": "application/json",
            },
            json={
                "model": ANTHROPIC_MODEL,
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=60,
        )
        resp.raise_for_status()
        content = resp.json()["content"]
        return "".join(block["text"] for block in content if block.get("type") == "text")

    def request_json(self, prompt: str) -> dict:
        """JSON専用出力を期待するプロンプトを送り、パースして返す。
        失敗時は1回だけ強調プロンプトで再試行する(server/src/routes/analyze.jsのリトライ挙動を踏襲)。
        """
        text = self._send(prompt)
        try:
            return json.loads(_strip_code_fence(text))
        except json.JSONDecodeError:
            retry_prompt = (
                f"{prompt}\n\n"
                "(前回の応答はJSONとして解析できませんでした。必ず有効なJSONのみを出力してください。"
                "前置き・コードフェンスは禁止です。)"
            )
            text = self._send(retry_prompt)
            return json.loads(_strip_code_fence(text))
