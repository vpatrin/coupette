from unittest.mock import AsyncMock, patch

import httpx
import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import SQLAlchemyError

from core.categories import CATEGORY_GROUPS
from core.config.settings import settings as core_settings
from core.db.models import Product, Store
from scraper.constants import EXIT_FATAL, EXIT_OK

_CATEGORY_PREFIXES = tuple(p for group in CATEGORY_GROUPS.values() for p in group.prefixes)


def _store(saq_store_id: str = "DEV-STORE-1") -> dict:
    return {
        "saq_store_id": saq_store_id,
        "name": "Plateau Mont-Royal",
        "city": "Montréal",
        "temporarily_closed": False,
    }


def _product(sku: str = "DEV-0001", store_ids: list[str] | None = None) -> dict:
    return {
        "sku": sku,
        "name": "Domaine Imaginaire Rouge",
        "category": "Vin rouge",
        "store_availability": store_ids if store_ids is not None else ["DEV-STORE-1"],
    }


def _executed_statements(mock_session: AsyncMock, tablename: str) -> list:
    return [
        c.args[0]
        for c in mock_session.execute.call_args_list
        if getattr(getattr(c.args[0], "table", None), "name", None) == tablename
    ]


def _added_products(mock_session: AsyncMock) -> list:
    # ORM-style writes (session.add / add_all) are an equally valid insert path
    added = [c.args[0] for c in mock_session.add.call_args_list]
    added += [obj for c in mock_session.add_all.call_args_list for obj in c.args[0]]
    return [obj for obj in added if isinstance(obj, Product)]


def _inserted_catalog(mock_insert: AsyncMock) -> tuple[list[dict], list[dict]]:
    # Accept positional or keyword arguments — both satisfy the planned signature
    args, kwargs = mock_insert.await_args
    stores = kwargs["stores"] if "stores" in kwargs else args[0]
    products = kwargs["products"] if "products" in kwargs else args[1]
    return stores, products


class TestSeedDevData:
    async def test_inserts_fixture_stores_and_products_when_products_table_is_empty(
        self,
    ) -> None:
        with (
            patch.object(core_settings, "ENVIRONMENT", "development"),
            patch("scraper.commands.seed.count_products", AsyncMock(return_value=0)),
            patch("scraper.commands.seed.insert_seed_catalog", AsyncMock()) as mock_insert,
        ):
            from scraper.commands.seed import load_dev_catalog, seed_dev_data

            result = await seed_dev_data()

        assert result == EXIT_OK
        mock_insert.assert_awaited_once()
        fixture_stores, fixture_products = load_dev_catalog()
        stores, products = _inserted_catalog(mock_insert)
        assert {s["saq_store_id"] for s in stores} == {s["saq_store_id"] for s in fixture_stores}
        assert {p["sku"] for p in products} == {p["sku"] for p in fixture_products}

    async def test_skips_insert_and_returns_exit_ok_when_products_already_exist(self) -> None:
        with (
            patch.object(core_settings, "ENVIRONMENT", "development"),
            patch("scraper.commands.seed.count_products", AsyncMock(return_value=1200)),
            patch("scraper.commands.seed.insert_seed_catalog", AsyncMock()) as mock_insert,
        ):
            from scraper.commands.seed import seed_dev_data

            result = await seed_dev_data()

        assert result == EXIT_OK
        mock_insert.assert_not_awaited()

    async def test_refuses_to_seed_and_returns_exit_fatal_in_production(self) -> None:
        with (
            patch.object(core_settings, "ENVIRONMENT", "production"),
            patch("scraper.commands.seed.count_products", AsyncMock(return_value=0)),
            patch("scraper.commands.seed.insert_seed_catalog", AsyncMock()) as mock_insert,
        ):
            from scraper.commands.seed import seed_dev_data

            result = await seed_dev_data()

        assert result == EXIT_FATAL
        mock_insert.assert_not_awaited()

    async def test_seeds_without_making_any_http_request(self) -> None:
        with (
            patch.object(core_settings, "ENVIRONMENT", "development"),
            patch("scraper.commands.seed.count_products", AsyncMock(return_value=0)),
            patch("scraper.commands.seed.insert_seed_catalog", AsyncMock()),
            patch.object(httpx.AsyncClient, "send", AsyncMock()) as mock_async_send,
            patch.object(httpx.Client, "send") as mock_sync_send,
        ):
            from scraper.commands.seed import seed_dev_data

            result = await seed_dev_data()

        assert result == EXIT_OK
        mock_async_send.assert_not_awaited()
        mock_sync_send.assert_not_called()

    async def test_returns_exit_fatal_when_catalog_insert_raises_sqlalchemy_error(self) -> None:
        with (
            patch.object(core_settings, "ENVIRONMENT", "development"),
            patch("scraper.commands.seed.count_products", AsyncMock(return_value=0)),
            patch(
                "scraper.commands.seed.insert_seed_catalog",
                AsyncMock(side_effect=SQLAlchemyError("conn lost")),
            ),
        ):
            from scraper.commands.seed import seed_dev_data

            result = await seed_dev_data()

        assert result == EXIT_FATAL


class TestInsertSeedCatalog:
    async def test_rolls_back_and_reraises_without_committing_when_insert_fails(
        self, mock_db_session
    ) -> None:
        mock_session, mock_factory = mock_db_session
        mock_session.execute.side_effect = SQLAlchemyError("connection lost")

        with patch("scraper.db.seed.SessionLocal", mock_factory):
            from scraper.db.seed import insert_seed_catalog

            with pytest.raises(SQLAlchemyError):
                await insert_seed_catalog([_store()], [_product()])

        mock_session.rollback.assert_called_once()
        mock_session.commit.assert_not_called()

    async def test_writes_stores_and_products_in_one_session_with_one_commit(
        self, mock_db_session
    ) -> None:
        mock_session, mock_factory = mock_db_session

        with patch("scraper.db.seed.SessionLocal", mock_factory):
            from scraper.db.seed import insert_seed_catalog

            await insert_seed_catalog([_store()], [_product()])

        assert mock_factory.call_count == 1
        assert _executed_statements(mock_session, Store.__tablename__) != []
        assert (
            _executed_statements(mock_session, Product.__tablename__) != []
            or _added_products(mock_session) != []
        )
        mock_session.commit.assert_awaited_once()
        mock_session.rollback.assert_not_called()

    async def test_inserts_stores_with_on_conflict_do_nothing(self, mock_db_session) -> None:
        mock_session, mock_factory = mock_db_session

        with patch("scraper.db.seed.SessionLocal", mock_factory):
            from scraper.db.seed import insert_seed_catalog

            await insert_seed_catalog([_store()], [_product()])

        store_statements = _executed_statements(mock_session, Store.__tablename__)
        compiled = [str(stmt.compile(dialect=postgresql.dialect())) for stmt in store_statements]
        assert compiled != []
        assert all("ON CONFLICT DO NOTHING" in sql for sql in compiled)


class TestCountProducts:
    async def test_returns_row_count_from_products_table(self, mock_db_session) -> None:
        mock_session, mock_factory = mock_db_session
        mock_session.scalar.return_value = 42

        with patch("scraper.db.seed.SessionLocal", mock_factory):
            from scraper.db.seed import count_products

            result = await count_products()

        assert result == 42


class TestLoadDevCatalog:
    def test_returns_at_least_one_store_and_one_product(self) -> None:
        from scraper.commands.seed import load_dev_catalog

        stores, products = load_dev_catalog()

        assert len(stores) >= 1
        assert len(products) >= 1

    def test_returns_unique_product_skus(self) -> None:
        from scraper.commands.seed import load_dev_catalog

        _, products = load_dev_catalog()

        skus = [p["sku"] for p in products]
        assert len(skus) == len(set(skus))

    def test_returns_non_numeric_skus_that_cannot_collide_with_catalog_skus(self) -> None:
        from scraper.commands.seed import load_dev_catalog

        _, products = load_dev_catalog()

        numeric = [p["sku"] for p in products if str(p["sku"]).isdigit()]
        assert numeric == []

    def test_assigns_every_product_a_category_matching_a_category_group_prefix(self) -> None:
        from scraper.commands.seed import load_dev_catalog

        _, products = load_dev_catalog()

        unmatched = [
            p["sku"]
            for p in products
            if not (p.get("category") or "").startswith(_CATEGORY_PREFIXES)
        ]
        assert unmatched == []

    def test_lists_only_fixture_store_ids_in_store_availability(self) -> None:
        from scraper.commands.seed import load_dev_catalog

        stores, products = load_dev_catalog()

        store_ids = {s["saq_store_id"] for s in stores}
        unknown = {
            store_id
            for p in products
            for store_id in (p.get("store_availability") or [])
            if store_id not in store_ids
        }
        assert unknown == set()

    def test_omits_url_and_image_on_every_product(self) -> None:
        from scraper.commands.seed import load_dev_catalog

        _, products = load_dev_catalog()

        with_links = [p["sku"] for p in products if p.get("url") or p.get("image")]
        assert with_links == []

    def test_keeps_saq_out_of_every_store_name(self) -> None:
        from scraper.commands.seed import load_dev_catalog

        stores, _ = load_dev_catalog()

        offending = [s["name"] for s in stores if "SAQ" in s["name"]]
        assert offending == []

    def test_returns_equal_data_on_repeated_loads(self) -> None:
        from scraper.commands.seed import load_dev_catalog

        assert load_dev_catalog() == load_dev_catalog()

    def test_uses_only_model_column_names_as_keys(self) -> None:
        from scraper.commands.seed import load_dev_catalog

        stores, products = load_dev_catalog()

        store_columns = {c.name for c in Store.__table__.columns}
        product_columns = {c.name for c in Product.__table__.columns}
        assert {k for s in stores for k in s} <= store_columns
        assert {k for p in products for k in p} <= product_columns


class TestSeedCommand:
    def test_registers_seed_dev_data_as_the_seed_subcommand(self) -> None:
        from scraper.__main__ import _COMMANDS
        from scraper.commands.seed import seed_dev_data

        assert _COMMANDS["seed"] is seed_dev_data

    def test_parses_seed_as_a_cli_subcommand(self) -> None:
        from scraper.__main__ import _build_parser

        args = _build_parser().parse_args(["seed"])

        assert args.command == "seed"
