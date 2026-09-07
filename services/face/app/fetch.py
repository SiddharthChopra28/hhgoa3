"""Fetch remote images with basic SSRF hardening and a size cap."""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

import httpx

from app.settings import settings

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


class FetchError(Exception):
    """Raised for any condition that should abort the fetch (blocked, too big, network error)."""


def _is_blocked_ip(ip_str: str) -> bool:
    ip = ipaddress.ip_address(ip_str)
    return (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _assert_public_host(hostname: str) -> None:
    """Reject a hostname that is itself an IP literal in a blocked range, or that
    resolves to one — a basic guard against SSRF via internal/loopback targets."""
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        ip = None
    if ip is not None:
        if _is_blocked_ip(hostname):
            raise FetchError("blocked_host")
        return

    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise FetchError("dns_resolution_failed") from exc
    for info in infos:
        addr = info[4][0]
        if _is_blocked_ip(addr):
            raise FetchError("blocked_host")


def fetch_image_bytes(url: str) -> bytes:
    """Download image bytes from url, capped at settings.max_image_bytes."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise FetchError("unsupported_scheme")
    if not parsed.hostname:
        raise FetchError("invalid_url")

    _assert_public_host(parsed.hostname)

    headers = {"User-Agent": _USER_AGENT}
    try:
        with httpx.Client(
            timeout=settings.fetch_timeout_s,
            follow_redirects=True,
            max_redirects=5,
            headers=headers,
        ) as client:
            with client.stream("GET", url) as resp:
                resp.raise_for_status()
                # Re-check the final host after redirects in case they landed on a private IP.
                final_host = urlparse(str(resp.url)).hostname
                if final_host:
                    _assert_public_host(final_host)

                chunks: list[bytes] = []
                total = 0
                for chunk in resp.iter_bytes():
                    total += len(chunk)
                    if total > settings.max_image_bytes:
                        raise FetchError("image_too_large")
                    chunks.append(chunk)
                return b"".join(chunks)
    except httpx.HTTPError as exc:
        raise FetchError(f"http_error: {exc}") from exc
