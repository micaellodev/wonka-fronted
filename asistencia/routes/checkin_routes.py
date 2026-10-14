from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

router = APIRouter()
templates = Jinja2Templates(directory="templates")

@router.get("/checkin/{employee_id}")
async def checkin_page(request: Request, employee_id: str):
    pool = request.app.state.pool
    async with pool.acquire() as conn:
        employee = await conn.fetchrow("SELECT id, name, dni FROM employees WHERE id = $1 AND is_active = true", employee_id)
    if not employee:
        return HTMLResponse("<html><body><h1>Empleado no encontrado o inactivo</h1></body></html>", status_code=404)

    return templates.TemplateResponse("checkin.html", {
        "request": request,
        "employee_id": employee_id,
        "employee_name": employee["name"]
    })

@router.get("/register/{employee_id}")
async def register_page(request: Request, employee_id: str):
    pool = request.app.state.pool
    async with pool.acquire() as conn:
        employee = await conn.fetchrow("SELECT id, name, dni FROM employees WHERE id = $1", employee_id)
    if not employee:
        return HTMLResponse("<html><body><h1>Empleado no encontrado</h1></body></html>", status_code=404)

    return templates.TemplateResponse("register_biometric.html", {
        "request": request,
        "employee_id": employee_id,
        "employee_name": employee["name"],
        "employee_dni": employee["dni"]
    })
