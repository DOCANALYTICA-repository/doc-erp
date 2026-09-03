from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

IS_SQLITE = settings.DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    # check_same_thread is required because FastAPI hands sessions between
    # threadpool workers.
    connect_args = {"check_same_thread": False}
    engine_kwargs = {}
else:
    connect_args = {
        # Fail fast instead of hanging a worker on an unreachable host. The
        # production endpoint has resolved IPv6-only in the past, which
        # without a timeout presents as a stuck request rather than an error.
        "connect_timeout": 5,
        # Names the connection in pg_stat_activity, so a stuck query can
        # actually be attributed to this service.
        "application_name": "doc-portal-api",
        # A hard ceiling on any single statement. Without it one pathological
        # query holds a pooled connection indefinitely.
        "options": "-c statement_timeout=15000",
    }
    engine_kwargs = {
        "pool_size": 5,
        "max_overflow": 5,
        "pool_timeout": 10,
    }

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    # pool_pre_ping issues a `SELECT 1` before EVERY checkout. Over a link with
    # a 127 ms round trip that is a full extra round trip on every single
    # request — it made a two-query endpoint six round trips.
    #
    # Turning it off is only safe because of pool_recycle below: connections
    # used to have pool_recycle=-1 and were never retired, so a connection
    # killed server-side (Supavisor idle timeout, a failover) stayed in the
    # pool forever and pre_ping was the only thing hiding it.
    pool_pre_ping=False,
    pool_recycle=1800,
    **engine_kwargs,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Transactional session for endpoints that write."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db_readonly():
    """Session for endpoints that only read.

    SQLAlchemy opens a transaction on first use and rolls it back on close,
    which is a BEGIN and a ROLLBACK on the wire — two more round trips per
    request, for endpoints that never write anything. AUTOCOMMIT drops both.

    Only for genuinely read-only paths (users, search, calendar, notifications,
    content). Anything that writes must use get_db, or its writes will be
    committed statement-by-statement with no rollback.
    """
    db = SessionLocal()
    try:
        db.connection(execution_options={"isolation_level": "AUTOCOMMIT"})
        yield db
    finally:
        db.close()
