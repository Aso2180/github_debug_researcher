import json

import responses

from src.clients.anthropic_client import AnthropicClient, ANTHROPIC_API_URL


def _mock_response(text: str):
    responses.add(
        responses.POST,
        ANTHROPIC_API_URL,
        json={"content": [{"type": "text", "text": text}]},
        status=200,
    )


@responses.activate
def test_request_json_parses_plain_json():
    _mock_response(json.dumps({"summary": "順調に伸びている", "trend_direction": "rising"}))
    client = AnthropicClient(api_key="test-key")

    result = client.request_json("prompt")

    assert result == {"summary": "順調に伸びている", "trend_direction": "rising"}


@responses.activate
def test_request_json_strips_code_fence():
    _mock_response("```json\n" + json.dumps({"summary": "横ばい", "trend_direction": "stable"}) + "\n```")
    client = AnthropicClient(api_key="test-key")

    result = client.request_json("prompt")

    assert result["trend_direction"] == "stable"


@responses.activate
def test_request_json_retries_once_on_invalid_json_then_succeeds():
    _mock_response("not json at all")
    _mock_response(json.dumps({"summary": "回復した", "trend_direction": "rising"}))
    client = AnthropicClient(api_key="test-key")

    result = client.request_json("prompt")

    assert result["trend_direction"] == "rising"
    assert len(responses.calls) == 2


@responses.activate
def test_request_json_raises_if_retry_also_fails():
    _mock_response("still not json")
    _mock_response("still not json again")
    client = AnthropicClient(api_key="test-key")

    try:
        client.request_json("prompt")
        assert False, "JSONDecodeErrorが発生するはず"
    except json.JSONDecodeError:
        pass
