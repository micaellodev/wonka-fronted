from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional
import html
import time
from datetime import datetime, timedelta
from fastapi.responses import StreamingResponse
import bcrypt as _bcrypt
from jose import jwt
from config import JWT_SECRET
from auth import get_current_admin
import io

router = APIRouter()

# Peru (Lima) has no DST and is always UTC-5. `schedules.entry_time` is a
# local Lima wall-clock time, but attendances are timestamped with
# datetime.utcnow() — comparing them naively is off by 5 hours (every
# check-in looks drastically late). Shift UTC instants into Lima wall-clock
# before deriving a date or a time-of-day from them.
LIMA_OFFSET = timedelta(hours=-5)


def to_lima(moment: datetime) -> datetime:
    return moment + LIMA_OFFSET

class LoginRequest(BaseModel):
    username: str = Field(max_length=50)
    password: str = Field(max_length=200)

# Brute-force guard for admin login: failures per client IP and per username.
# shortcut: in-memory, single process; move to the DB/Redis if this app is scaled out.
LOGIN_WINDOW_S = 600
LOGIN_MAX_FAILS = 10
_login_fails: dict[str, list[float]] = {}


def _recent_fails(key: str) -> list[float]:
    now = time.monotonic()
    fails = [t for t in _login_fails.get(key, []) if now - t < LOGIN_WINDOW_S]
    _login_fails[key] = fails
    return fails


@router.post("/login")
async def admin_login(data: LoginRequest, request: Request):
    keys = [f"ip:{request.client.host if request.client else 'unknown'}", f"user:{data.username.lower()}"]
    if any(len(_recent_fails(k)) >= LOGIN_MAX_FAILS for k in keys):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Intenta de nuevo en unos minutos.")
    pool = request.app.state.pool
    async with pool.acquire() as conn:
        admin = await conn.fetchrow(
            "SELECT id, username, password_hash FROM admins WHERE username = $1",
            data.username
        )
    if not admin or not _bcrypt.checkpw(data.password.encode(), admin["password_hash"].encode()):
        for k in keys:
            _login_fails.setdefault(k, []).append(time.monotonic())
        raise HTTPException(status_code=401, detail="Invalid credentials")
    _login_fails.pop(keys[0], None)

    token = jwt.encode(
        {"sub": str(admin["id"]), "exp": datetime.utcnow() + timedelta(hours=24)},
        JWT_SECRET,
        algorithm="HS256"
    )
    return {"token": token, "username": admin["username"]}

# Names are rendered with innerHTML by the admin pages: forbid markup characters.
NAME_PATTERN = r"^[^<>&\"'`]{1,100}$"
DNI_PATTERN = r"^\d{8}$"

class EmployeeCreate(BaseModel):
    name: str = Field(pattern=NAME_PATTERN)
    dni: str = Field(pattern=DNI_PATTERN)

class EmployeeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, pattern=NAME_PATTERN)
    dni: Optional[str] = Field(default=None, pattern=DNI_PATTERN)
    is_active: Optional[bool] = None

class ScheduleUpdate(BaseModel):
    entry_time: str
    exit_time: str
    grace_minutes: int = 10

class WebAuthnRegisterRequest(BaseModel):
    employee_id: str
    credential: dict

class CheckinRequest(BaseModel):
    employee_id: str
    credential: dict

@router.get("/employees")
async def list_employees(request: Request, admin_id: str = Depends(get_current_admin)):
    pool = request.app.state.pool
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, name, dni, is_active, created_at FROM employees ORDER BY name")
    return [dict(r) for r in rows]

@router.post("/employees")
async def create_employee(data: EmployeeCreate, request: Request, admin_id: str = Depends(get_current_admin)):
    pool = request.app.state.pool
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM employees WHERE dni = $1", data.dni)
        if existing:
            raise HTTPException(status_code=400, detail="DNI already registered")

        emp = await conn.fetchrow(
            "INSERT INTO employees (name, dni) VALUES ($1, $2) RETURNING id, name, dni, is_active, created_at",
            data.name, data.dni
        )
        await conn.execute("INSERT INTO schedules (employee_id) VALUES ($1)", emp["id"])
    return dict(emp)

@router.patch("/employees/{employee_id}")
async def update_employee(employee_id: str, data: EmployeeUpdate, request: Request, admin_id: str = Depends(get_current_admin)):
    pool = request.app.state.pool
    sets = []
    vals = []
    idx = 1
    if data.name is not None:
        sets.append(f"name = ${idx}")
        vals.append(data.name)
        idx += 1
    if data.dni is not None:
        sets.append(f"dni = ${idx}")
        vals.append(data.dni)
        idx += 1
    if data.is_active is not None:
        sets.append(f"is_active = ${idx}")
        vals.append(data.is_active)
        idx += 1
    if not sets:
        raise HTTPException(status_code=400, detail="No fields to update")

    vals.append(employee_id)
    async with pool.acquire() as conn:
        emp = await conn.fetchrow(
            f"UPDATE employees SET {', '.join(sets)} WHERE id = ${idx} RETURNING id, name, dni, is_active, created_at",
            *vals
        )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return dict(emp)

@router.get("/employees/{employee_id}/schedule")
async def get_schedule(employee_id: str, request: Request, admin_id: str = Depends(get_current_admin)):
    pool = request.app.state.pool
    async with pool.acquire() as conn:
        sched = await conn.fetchrow(
            "SELECT id, employee_id, entry_time, exit_time, grace_minutes FROM schedules WHERE employee_id = $1",
            employee_id
        )
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return dict(sched)

@router.put("/employees/{employee_id}/schedule")
async def update_schedule(employee_id: str, data: ScheduleUpdate, request: Request, admin_id: str = Depends(get_current_admin)):
    pool = request.app.state.pool
    async with pool.acquire() as conn:
        sched = await conn.fetchrow(
            """UPDATE schedules SET entry_time = $1, exit_time = $2, grace_minutes = $3, updated_at = now()
               WHERE employee_id = $4 RETURNING id, employee_id, entry_time, exit_time, grace_minutes""",
            data.entry_time, data.exit_time, data.grace_minutes, employee_id
        )
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return dict(sched)

@router.get("/reports")
async def get_reports(request: Request, start_date: str = None, end_date: str = None, employee_id: str = None, admin_id: str = Depends(get_current_admin)):
    pool = request.app.state.pool
    query = """
        SELECT a.id, a.employee_id, e.name as employee_name, e.dni,
               a.check_in, a.check_out, a.hours_worked, a.minutes_late,
               s.entry_time as scheduled_entry
        FROM attendances a
        JOIN employees e ON a.employee_id = e.id
        LEFT JOIN schedules s ON a.employee_id = s.employee_id
        WHERE 1=1
    """
    params = []
    idx = 1

    if start_date:
        query += f" AND a.check_in >= ${idx}"
        params.append(start_date)
        idx += 1
    if end_date:
        query += f" AND a.check_in <= ${idx}"
        params.append(end_date + " 23:59:59")
        idx += 1
    if employee_id:
        query += f" AND a.employee_id = ${idx}"
        params.append(employee_id)
        idx += 1

    query += " ORDER BY a.check_in DESC"

    async with pool.acquire() as conn:
        records = await conn.fetch(query, *params)
    return [dict(r) for r in records]

@router.get("/reports/export")
async def export_reports(request: Request, start_date: str = None, end_date: str = None, employee_id: str = None, admin_id: str = Depends(get_current_admin)):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    pool = request.app.state.pool
    query = """
        SELECT a.id, a.employee_id, e.name as employee_name, e.dni,
               a.check_in, a.check_out, a.hours_worked, a.minutes_late,
               s.entry_time as scheduled_entry
        FROM attendances a
        JOIN employees e ON a.employee_id = e.id
        LEFT JOIN schedules s ON a.employee_id = s.employee_id
        WHERE 1=1
    """
    params = []
    idx = 1

    if start_date:
        query += f" AND a.check_in >= ${idx}"
        params.append(start_date)
        idx += 1
    if end_date:
        query += f" AND a.check_in <= ${idx}"
        params.append(end_date + " 23:59:59")
        idx += 1
    if employee_id:
        query += f" AND a.employee_id = ${idx}"
        params.append(employee_id)
        idx += 1

    query += " ORDER BY e.name, a.check_in"

    async with pool.acquire() as conn:
        records = await conn.fetch(query, *params)

    wb = Workbook()

    # Sheet 1 - Detail
    ws1 = wb.active
    ws1.title = "Detalle"
    headers = ["Fecha", "Empleado", "DNI", "Hora Entrada", "Hora Salida", "Horas Trabajadas", "Tardanza (min)", "Estado"]
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True)
    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )

    for col, header in enumerate(headers, 1):
        cell = ws1.cell(row=1, column=col, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center')
        cell.border = thin_border

    for row_idx, record in enumerate(records, 2):
        check_in = record["check_in"]
        check_out = record["check_out"]
        status = "Tardanza" if (record["minutes_late"] or 0) > 0 else "A tiempo"

        ws1.cell(row=row_idx, column=1, value=check_in.strftime("%Y-%m-%d") if check_in else "")
        ws1.cell(row=row_idx, column=2, value=record["employee_name"])
        ws1.cell(row=row_idx, column=3, value=record["dni"])
        ws1.cell(row=row_idx, column=4, value=check_in.strftime("%H:%M") if check_in else "")
        ws1.cell(row=row_idx, column=5, value=check_out.strftime("%H:%M") if check_out else "—")
        ws1.cell(row=row_idx, column=6, value=float(record["hours_worked"]) if record["hours_worked"] else 0)
        ws1.cell(row=row_idx, column=7, value=record["minutes_late"] or 0)
        ws1.cell(row=row_idx, column=8, value=status)

        for c in range(1, 9):
            ws1.cell(row=row_idx, column=c).border = thin_border

    for c in range(1, 9):
        ws1.column_dimensions[chr(64 + c)].width = 18

    # Sheet 2 - Summary
    ws2 = wb.create_sheet("Resumen")
    summary_headers = ["Empleado", "DNI", "Total Horas", "Promedio Tardanza (min)", "Dias Asistidos"]
    for col, header in enumerate(summary_headers, 1):
        cell = ws2.cell(row=1, column=col, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center')
        cell.border = thin_border

    async with pool.acquire() as conn:
        summary_records = await conn.fetch("""
            SELECT e.name, e.dni,
                   COALESCE(SUM(a.hours_worked), 0) as total_hours,
                   COALESCE(AVG(a.minutes_late), 0) as avg_late,
                   COUNT(a.id) as days_attended
            FROM employees e
            LEFT JOIN attendances a ON e.id = a.employee_id
            GROUP BY e.id, e.name, e.dni
            ORDER BY e.name
        """)

    for row_idx, record in enumerate(summary_records, 2):
        ws2.cell(row=row_idx, column=1, value=record["name"])
        ws2.cell(row=row_idx, column=2, value=record["dni"])
        ws2.cell(row=row_idx, column=3, value=float(record["total_hours"]))
        ws2.cell(row=row_idx, column=4, value=round(float(record["avg_late"]), 1))
        ws2.cell(row=row_idx, column=5, value=record["days_attended"])

        for c in range(1, 6):
            ws2.cell(row=row_idx, column=c).border = thin_border

    for c in range(1, 6):
        ws2.column_dimensions[chr(64 + c)].width = 22

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=reporte_asistencia.xlsx"}
    )

@router.get("/employees/{employee_id}/biometric-options")
async def get_biometric_options(employee_id: str, request: Request, admin_id: str = Depends(get_current_admin)):
    from auth import generate_registration_options
    pool = request.app.state.pool
    async with pool.acquire() as conn:
        employee = await conn.fetchrow("SELECT id FROM employees WHERE id = $1", employee_id)
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
        existing = await conn.fetch("SELECT credential_id FROM webauthn_credentials WHERE employee_id = $1", employee_id)

    existing_creds = [{"credential_id": bytes(c["credential_id"])} for c in existing]
    options = generate_registration_options(employee_id, existing_creds)
    return options

@router.post("/employees/{employee_id}/register-biometric")
async def register_biometric(employee_id: str, data: WebAuthnRegisterRequest, request: Request, admin_id: str = Depends(get_current_admin)):
    from auth import verify_registration
    pool = request.app.state.pool
    async with pool.acquire() as conn:
        employee = await conn.fetchrow("SELECT id FROM employees WHERE id = $1", employee_id)
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")

    try:
        result = verify_registration(employee_id, data.credential)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO webauthn_credentials (employee_id, credential_id, public_key, sign_count) VALUES ($1, $2, $3, $4)",
            employee_id, result["credential_id"], result["public_key"], result["sign_count"]
        )
    return {"status": "ok", "message": "Biometric registered successfully"}

@router.get("/employees/{employee_id}/login-options")
async def get_login_options(employee_id: str, request: Request):
    from auth import generate_authentication_options
    pool = request.app.state.pool
    async with pool.acquire() as conn:
        employee = await conn.fetchrow("SELECT id FROM employees WHERE id = $1", employee_id)
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
        existing = await conn.fetch("SELECT credential_id FROM webauthn_credentials WHERE employee_id = $1", employee_id)

    if not existing:
        raise HTTPException(status_code=400, detail="No biometric registered")

    existing_creds = [{"credential_id": bytes(c["credential_id"])} for c in existing]
    options = generate_authentication_options(employee_id, existing_creds)
    return options

@router.post("/checkin")
async def process_checkin(data: CheckinRequest, request: Request):
    from auth import verify_authentication
    from datetime import datetime as dt
    pool = request.app.state.pool

    async with pool.acquire() as conn:
        employee = await conn.fetchrow("SELECT id, name FROM employees WHERE id = $1 AND is_active = true", data.employee_id)
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found or inactive")

        cred = await conn.fetchrow("SELECT credential_id, public_key, sign_count FROM webauthn_credentials WHERE employee_id = $1", data.employee_id)
        if not cred:
            raise HTTPException(status_code=400, detail="No biometric registered")

    try:
        new_sign_count = verify_authentication(data.employee_id, data.credential, dict(cred))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Persist the updated WebAuthn signature counter so cloned-credential
    # replay attempts (counter going backwards) can be detected next time.
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE webauthn_credentials SET sign_count = $1 WHERE credential_id = $2",
            new_sign_count, cred["credential_id"]
        )

    today = dt.utcnow().date()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id, check_in, check_out FROM attendances WHERE employee_id = $1 AND check_in::date = $2 ORDER BY check_in DESC LIMIT 1",
            data.employee_id, today
        )

        if existing and not existing["check_out"]:
            check_out = dt.utcnow()
            hours_worked = (check_out - existing["check_in"]).total_seconds() / 3600

            schedule = await conn.fetchrow("SELECT entry_time, grace_minutes FROM schedules WHERE employee_id = $1", data.employee_id)
            minutes_late = 0
            if schedule:
                scheduled_entry = schedule["entry_time"]
                # schedules.entry_time is Lima-local wall-clock, but check_in is
                # stored as a UTC instant — convert before comparing times-of-day,
                # otherwise every check-in appears ~5 hours late.
                actual_entry = to_lima(existing["check_in"]).time()
                if actual_entry > scheduled_entry:
                    diff_minutes = int((datetime.combine(today, actual_entry) - datetime.combine(today, scheduled_entry)).total_seconds() / 60)
                    minutes_late = max(0, diff_minutes - schedule["grace_minutes"])

            await conn.execute(
                "UPDATE attendances SET check_out = $1, hours_worked = $2, minutes_late = $3 WHERE id = $4",
                check_out, round(hours_worked, 2), minutes_late, existing["id"]
            )
            return {"action": "CHECK_OUT", "employee": employee["name"], "timestamp": check_out.isoformat()}
        else:
            check_in = dt.utcnow()
            await conn.execute("INSERT INTO attendances (employee_id, check_in) VALUES ($1, $2)", data.employee_id, check_in)
            return {"action": "CHECK_IN", "employee": employee["name"], "timestamp": check_in.isoformat()}

@router.get("/qr/{employee_id}")
async def generate_qr(employee_id: str, request: Request):
    import qrcode
    import base64
    from fastapi.responses import HTMLResponse

    pool = request.app.state.pool
    async with pool.acquire() as conn:
        employee = await conn.fetchrow("SELECT id, name FROM employees WHERE id = $1", employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    base_url = str(request.base_url).rstrip("/")
    checkin_url = f"{base_url}/checkin/{employee_id}"

    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(checkin_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    img_base64 = base64.b64encode(buffer.getvalue()).decode()

    safe_name = html.escape(employee["name"])
    return HTMLResponse(f"""
        <html>
        <head><title>QR - {safe_name}</title></head>
        <body style="text-align:center; font-family:sans-serif; padding:20px;">
            <h2>{safe_name}</h2>
            <img src="data:image/png;base64,{img_base64}" />
            <p>Escanea para marcar asistencia</p>
        </body>
        </html>
    """)
