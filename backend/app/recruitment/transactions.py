from contextlib import asynccontextmanager

@asynccontextmanager
async def recruitment_transaction():
    """Mongo transaction boundary; requires a replica set in production."""
    from app.core import database
    if database.client is None:
        raise RuntimeError("Database is not initialized")
    async with await database.client.start_session() as session:
        async with session.start_transaction():
            yield session
