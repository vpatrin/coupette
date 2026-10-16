# These tests compile the statements the repo sends to the session with the Postgres dialect.
# CI has no Postgres for backend tests, so this is the only check on the SQL contract that
# route tests (which mock the repo) cannot see. Live execution is still owed against a dev DB.
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from backend.repositories import cellar as repo

USER_ID = 7
SKU = "SKU123"


def _sql(clause, *, literal_binds: bool = True) -> str:
    compile_kwargs = {"literal_binds": True} if literal_binds else {}
    compiled = clause.compile(dialect=postgresql.dialect(), compile_kwargs=compile_kwargs)
    return " ".join(str(compiled).split())


def _statements(db: AsyncMock) -> list:
    return [call.args[0] for call in db.execute.await_args_list]


def _row():
    return SimpleNamespace(quantity=1), SimpleNamespace(sku=SKU)


@pytest.fixture()
def db() -> AsyncMock:
    session = AsyncMock(spec=AsyncSession)
    result = MagicMock()
    result.one.return_value = _row()
    result.one_or_none.return_value = _row()
    result.all.return_value = [_row()]
    session.execute.return_value = result
    return session


# ── upsert ────────────────────────────────────────────────────


async def test_upsert_adds_incoming_quantity_on_user_sku_conflict_and_leaves_added_at_alone(db):
    await repo.upsert(db, USER_ID, SKU, 3)

    sql = _sql(_statements(db)[0])
    assert sql.startswith("INSERT INTO cellar_entries")
    assert "ON CONFLICT ON CONSTRAINT uq_cellar_entries_user_sku DO UPDATE SET " in sql
    set_clause = sql.split("DO UPDATE SET ", 1)[1].split(" RETURNING", 1)[0]
    assert set_clause == "quantity = (cellar_entries.quantity + excluded.quantity)"


async def test_upsert_binds_caller_id_sku_and_requested_quantity(db):
    await repo.upsert(db, USER_ID, SKU, 3)

    params = _statements(db)[0].compile(dialect=postgresql.dialect()).params
    assert (params["user_id"], params["sku"], params["quantity"]) == (USER_ID, SKU, 3)


async def test_upsert_returns_the_entry_and_product_reselected_for_the_caller(db):
    entry, product = await repo.upsert(db, USER_ID, SKU, 3)

    reselect = _statements(db)[1]
    assert _sql(reselect.whereclause) == (
        f"cellar_entries.user_id = {USER_ID} AND cellar_entries.sku = '{SKU}'"
    )
    assert (entry.quantity, product.sku) == (1, SKU)


async def test_upsert_reselect_refreshes_identity_mapped_entries(db):
    await repo.upsert(db, USER_ID, SKU, 3)

    reselect = _statements(db)[1]
    assert reselect.get_execution_options().get("populate_existing") is True


# ── find_by_user ──────────────────────────────────────────────


async def test_find_by_user_filters_on_caller_id_without_a_delisted_filter(db):
    await repo.find_by_user(db, USER_ID)

    assert _sql(_statements(db)[0].whereclause) == f"cellar_entries.user_id = {USER_ID}"


async def test_find_by_user_inner_joins_products_in_a_single_query(db):
    await repo.find_by_user(db, USER_ID)

    assert db.execute.await_count == 1
    sql = _sql(_statements(db)[0])
    assert "FROM cellar_entries JOIN products ON cellar_entries.sku = products.sku" in sql
    assert "OUTER" not in sql


async def test_find_by_user_orders_newest_first(db):
    await repo.find_by_user(db, USER_ID)

    assert _sql(_statements(db)[0]).endswith("ORDER BY cellar_entries.added_at DESC")


async def test_find_by_user_returns_entry_product_rows_as_a_list(db):
    rows = await repo.find_by_user(db, USER_ID)

    assert isinstance(rows, list)
    assert [(entry.quantity, product.sku) for entry, product in rows] == [(1, SKU)]


# ── find_one ──────────────────────────────────────────────────


async def test_find_one_filters_on_caller_id_and_sku_without_a_delisted_filter(db):
    await repo.find_one(db, USER_ID, SKU)

    assert _sql(_statements(db)[0].whereclause) == (
        f"cellar_entries.user_id = {USER_ID} AND cellar_entries.sku = '{SKU}'"
    )


async def test_find_one_returns_entry_and_product_when_row_exists(db):
    entry, product = await repo.find_one(db, USER_ID, SKU)

    assert (entry.quantity, product.sku) == (1, SKU)


async def test_find_one_returns_none_when_no_row_matches(db):
    db.execute.return_value.one_or_none.return_value = None

    assert await repo.find_one(db, USER_ID, SKU) is None


# ── update / delete ───────────────────────────────────────────


async def test_update_sets_quantity_and_flushes(db):
    entry = SimpleNamespace(quantity=1)

    await repo.update(db, entry, 5)

    assert entry.quantity == 5
    db.flush.assert_awaited_once()


async def test_delete_removes_the_entry_and_flushes(db):
    entry = SimpleNamespace(quantity=1)

    await repo.delete(db, entry)

    db.delete.assert_awaited_once_with(entry)
    db.flush.assert_awaited_once()
