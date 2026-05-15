import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))

# Resolve relative sqlite paths to be absolute (anchored to this file's directory)
# so the DB is always ~/kansa-vision/backend/kansa.db regardless of where uvicorn is run from.
_raw_url = os.getenv("DATABASE_URL", f"sqlite:///{_THIS_DIR}/kansa.db")
if _raw_url.startswith("sqlite:///") and not _raw_url.startswith("sqlite:////"):
    _rel = _raw_url[len("sqlite:///"):]
    if not os.path.isabs(_rel):
        _abs = os.path.normpath(os.path.join(_THIS_DIR, _rel))
        _raw_url = f"sqlite:///{_abs}"
DATABASE_URL = _raw_url

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    import db_models  # noqa: F401 — ensures models are registered
    Base.metadata.create_all(bind=engine)
