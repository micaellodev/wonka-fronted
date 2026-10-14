from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import database
from routes import admin_routes, checkin_routes
import uvicorn

app = FastAPI(title="Wonka Asistencia")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

app.include_router(admin_routes.router, prefix="/api/admin", tags=["admin"])
app.include_router(checkin_routes.router, tags=["checkin"])

@app.on_event("startup")
async def startup():
    await database.init_db()
    app.state.pool = database.pool

@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})

@app.get("/login")
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.get("/employees")
async def employees_page(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request, "page": "employees"})

@app.get("/employees/new")
async def new_employee_page(request: Request):
    return templates.TemplateResponse("employee_form.html", {"request": request, "employee_id": None})

@app.get("/employees/{employee_id}/edit")
async def edit_employee_page(request: Request, employee_id: str):
    return templates.TemplateResponse("employee_form.html", {"request": request, "employee_id": employee_id})

@app.get("/employees/{employee_id}/schedule")
async def schedule_page(request: Request, employee_id: str):
    return templates.TemplateResponse("schedule.html", {"request": request, "employee_id": employee_id})

@app.get("/reports")
async def reports_page(request: Request):
    return templates.TemplateResponse("reports.html", {"request": request})

@app.get("/register/{employee_id}")
async def register_biometric_page(request: Request, employee_id: str):
    return templates.TemplateResponse("register_biometric.html", {"request": request, "employee_id": employee_id})

@app.get("/checkin/{employee_id}")
async def checkin_page(request: Request, employee_id: str):
    return templates.TemplateResponse("checkin.html", {"request": request, "employee_id": employee_id})

@app.get("/qr")
async def qr_display_page(request: Request):
    return templates.TemplateResponse("qr_display.html", {"request": request})

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
