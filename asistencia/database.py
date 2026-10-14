import asyncpg
from config import DATABASE_URL

pool: asyncpg.Pool = None

async def init_db():
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=5)
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS admins (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMPTZ DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS employees (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL,
                dni VARCHAR(8) UNIQUE NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS webauthn_credentials (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                credential_id BYTEA UNIQUE NOT NULL,
                public_key BYTEA NOT NULL,
                sign_count BIGINT DEFAULT 0,
                device_type VARCHAR(50),
                backed_up BOOLEAN DEFAULT false,
                transports JSONB,
                created_at TIMESTAMPTZ DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS schedules (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                employee_id UUID UNIQUE NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                entry_time TIME NOT NULL DEFAULT '08:00',
                exit_time TIME NOT NULL DEFAULT '17:00',
                grace_minutes INT DEFAULT 10,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS attendances (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                employee_id UUID NOT NULL REFERENCES employees(id),
                check_in TIMESTAMPTZ NOT NULL DEFAULT now(),
                check_out TIMESTAMPTZ,
                hours_worked DECIMAL(5,2),
                minutes_late INT DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS idx_att_employee_date
                ON attendances(employee_id, check_in);
            CREATE INDEX IF NOT EXISTS idx_att_checkin
                ON attendances(check_in);
        """)
