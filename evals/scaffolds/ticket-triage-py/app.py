from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()
TICKETS: list[dict] = []


class TicketIn(BaseModel):
    email: str
    subject: str
    body: str


@app.post("/tickets")
def create_ticket(ticket: TicketIn):
    record = {"id": len(TICKETS) + 1, **ticket.model_dump(), "queue": None}
    TICKETS.append(record)
    return record
