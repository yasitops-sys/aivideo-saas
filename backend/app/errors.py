"""Consistent, safe error responses. Never leak internals to the client."""
from fastapi import HTTPException


def _err(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def unauthenticated(msg: str = "Authentication required.") -> HTTPException:
    return _err(401, "unauthenticated", msg)


def forbidden(msg: str = "You do not have permission to do that.") -> HTTPException:
    return _err(403, "forbidden", msg)


def not_found(msg: str = "Not found.") -> HTTPException:
    return _err(404, "not_found", msg)


def validation(msg: str) -> HTTPException:
    return _err(422, "validation_error", msg)


def conflict(msg: str) -> HTTPException:
    return _err(409, "conflict", msg)


def insufficient_credits(msg: str = "Not enough credits. Please buy a credit package.") -> HTTPException:
    return _err(402, "insufficient_credits", msg)


def rate_limited(msg: str = "Too many requests. Please slow down.") -> HTTPException:
    return _err(429, "rate_limited", msg)


def server_error() -> HTTPException:
    return _err(500, "server_error", "Something went wrong. Please try again later.")
