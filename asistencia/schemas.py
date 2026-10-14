from pydantic import BaseModel
from typing import Optional
from datetime import time

class LoginRequest(BaseModel):
    username: str
    password: str

class EmployeeCreate(BaseModel):
    name: str
    dni: str

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    dni: Optional[str] = None
    is_active: Optional[bool] = None

class ScheduleUpdate(BaseModel):
    entry_time: str
    exit_time: str
    grace_minutes: int = 10

class WebAuthnRegisterRequest(BaseModel):
    employee_id: str
    credential: dict

class WebAuthnLoginRequest(BaseModel):
    employee_id: str
    credential: dict

class CheckinRequest(BaseModel):
    employee_id: str
    credential: dict
