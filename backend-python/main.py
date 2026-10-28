import psycopg2
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from db import get_connection  # noqa: F401  (tests and scripts import it from here)
from routers import admin, auth, checkin, events, notifications, orders, organizer, promo, staff, support

app = FastAPI(title="BiletFlow API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

#the order here matters in one place: orders.py defines the fixed-word
#routes (like /api/tickets/my-tickets) before the {id} ones inside the file
for module in (auth, events, orders, checkin, staff, promo, support, organizer, admin, notifications):
    app.include_router(module.router)


#a few database complaints are really the caller's mistake, so we answer them
#with a clear 4xx message instead of a scary 500
@app.exception_handler(psycopg2.errors.UniqueViolation)
async def unique_violation(request: Request, exc):
    return JSONResponse(status_code=409, content={"detail": "That already exists"})


@app.exception_handler(psycopg2.errors.CheckViolation)
async def check_violation(request: Request, exc):
    return JSONResponse(status_code=400, content={"detail": "One of the values is not allowed: " + str(exc).split("\n")[0]})


@app.exception_handler(psycopg2.errors.ForeignKeyViolation)
async def fk_violation(request: Request, exc):
    return JSONResponse(status_code=404, content={"detail": "A record you referred to does not exist"})


@app.exception_handler(psycopg2.DataError)
async def data_error(request: Request, exc):
    return JSONResponse(status_code=400, content={"detail": "A value has the wrong format (for example an id or a date)"})
