"""Shared fixtures: one toy engine per test session."""

from __future__ import annotations

import pytest

from app.engine import Engine


@pytest.fixture(scope="session")
def engine() -> Engine:
    return Engine(toy=True)
