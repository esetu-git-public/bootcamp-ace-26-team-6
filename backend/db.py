"""
Supabase Database Client
Provides helper functions for CRUD operations.
"""

import httpx
from backend.config import settings

# Base URLs
BASE_URL = f"{settings.supabase_url.rstrip('/')}/rest/v1"
STORAGE_URL = f"{settings.supabase_url.rstrip('/')}/storage/v1"

# Default headers
HEADERS = {
    "apikey": settings.supabase_service_key,
    "Authorization": f"Bearer {settings.supabase_service_key}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}


def _handle_response(response: httpx.Response):
    """Handle Supabase API responses."""
    if response.status_code >= 400:
        raise Exception(
            f"Supabase Error [{response.status_code}]: {response.text}"
        )

    if response.text:
        return response.json()

    return []


# -------------------------------
# SELECT
# -------------------------------
def select(table: str, params: dict | None = None):
    response = httpx.get(
        f"{BASE_URL}/{table}",
        headers=HEADERS,
        params=params or {},
        timeout=15,
    )
    return _handle_response(response)


# -------------------------------
# INSERT
# -------------------------------
def insert(table: str, data: dict):
    response = httpx.post(
        f"{BASE_URL}/{table}",
        headers={**HEADERS, "Prefer": "return=representation"},
        json=data,
        timeout=15,
    )
    return _handle_response(response)


# -------------------------------
# UPDATE
# -------------------------------
def update(table: str, data: dict, field: str, value):
    response = httpx.patch(
        f"{BASE_URL}/{table}",
        headers={**HEADERS, "Prefer": "return=representation"},
        params={field: f"eq.{value}"},
        json=data,
        timeout=15,
    )
    return _handle_response(response)


# -------------------------------
# DELETE
# -------------------------------
def delete(table: str, field: str, value):
    response = httpx.delete(
        f"{BASE_URL}/{table}",
        headers={**HEADERS, "Prefer": "return=representation"},
        params={field: f"eq.{value}"},
        timeout=15,
    )
    return _handle_response(response)