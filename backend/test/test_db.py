import pytest
from unittest.mock import patch, MagicMock

from backend.db import (
    _handle_response,
    select,
    insert,
    update,
    _raw_delete
)


def test_handle_response_success():
    response = MagicMock()
    response.status_code = 200
    response.text = '[{"id":1}]'
    response.json.return_value = [{"id": 1}]

    assert _handle_response(response) == [{"id": 1}]


def test_handle_response_empty():
    response = MagicMock()
    response.status_code = 200
    response.text = ""

    assert _handle_response(response) == []


def test_handle_response_error():
    response = MagicMock()
    response.status_code = 404
    response.text = "Not Found"

    with pytest.raises(Exception):
        _handle_response(response)



@patch("backend.db.httpx.get")
def test_select(mock_get):

    response = MagicMock()
    response.status_code = 200
    response.text = '[{"name":"Admin"}]'
    response.json.return_value = [{"name": "Admin"}]

    mock_get.return_value = response

    result = select("roles")

    assert result[0]["name"] == "Admin"

    mock_get.assert_called_once()



@patch("backend.db.httpx.post")
def test_insert(mock_post):

    response = MagicMock()
    response.status_code = 201
    response.text = '[{"id":"1"}]'
    response.json.return_value = [{"id": "1"}]

    mock_post.return_value = response

    result = insert("roles", {"name": "Admin"})

    assert result[0]["id"] == "1"

    mock_post.assert_called_once()



@patch("backend.db.httpx.patch")
def test_update(mock_patch):

    response = MagicMock()
    response.status_code = 200
    response.text = '[{"active":true}]'
    response.json.return_value = [{"active": True}]

    mock_patch.return_value = response

    result = update(
        "roles",
        {"active": True},
        "id",
        1,
    )

    assert result[0]["active"] is True

    mock_patch.assert_called_once()


@patch("backend.db.httpx.delete")
def test_delete_success(mock_delete):

    response = MagicMock()
    response.status_code = 204
    response.text = ""

    mock_delete.return_value = response

    assert _raw_delete("roles", "id", 1) is True

    mock_delete.assert_called_once()


@patch("backend.db.httpx.delete")
def test_delete_failure(mock_delete):

    response = MagicMock()
    response.status_code = 404
    response.text = "Not Found"

    mock_delete.return_value = response

    with pytest.raises(Exception):
        _raw_delete("roles", "id", 1)