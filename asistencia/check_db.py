import asyncio
import asyncpg
from config import DATABASE_URL

async def check():
    conn = await asyncpg.connect(DATABASE_URL)
    tables = await conn.fetch("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    print("Tablas:", [t["tablename"] for t in tables])
    admins = await conn.fetch("SELECT * FROM admins")
    print("Admins:", [dict(a) for a in admins])
    await conn.close()

asyncio.run(check())
