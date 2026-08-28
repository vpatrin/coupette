# The fixture creates only CellarEntry.__table__, never core.db.base.Base.metadata:
# products.tasting_profile is JSONB, which SQLite can't compile — create_all() breaks this file.
import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.db.models import CellarEntry


def _entry(**overrides) -> CellarEntry:
    defaults = dict(user_id=1, sku="12345678", quantity=1)
    defaults.update(overrides)
    return CellarEntry(**defaults)


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    CellarEntry.__table__.create(engine)
    with Session(engine) as session:
        yield session


def test_duplicate_user_sku_raises_integrity_error(db_session):
    db_session.add(_entry(user_id=1, sku="12345678"))
    db_session.commit()

    db_session.add(_entry(user_id=1, sku="12345678"))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_zero_quantity_raises_integrity_error(db_session):
    db_session.add(_entry(quantity=0))
    with pytest.raises(IntegrityError):
        db_session.commit()
