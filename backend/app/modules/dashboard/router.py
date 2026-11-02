from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, StaffUser
from app.modules.dashboard import service
from app.modules.dashboard.schemas import AtRiskStudent, SummaryOut, WeekPoint

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def get_scope(
    db: DbSession,
    user: StaffUser,
    class_id: int | None = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
) -> service.Scope:
    return service.Scope(db, user, class_id, date_from, date_to)


ScopeDep = Annotated[service.Scope, Depends(get_scope)]


@router.get("/summary", response_model=SummaryOut)
def summary(db: DbSession, scope: ScopeDep):
    return service.summary(db, scope)


@router.get("/weekly-trend", response_model=list[WeekPoint])
def weekly_trend(db: DbSession, scope: ScopeDep):
    return service.weekly_trend(db, scope)


@router.get("/at-risk-students", response_model=list[AtRiskStudent])
def at_risk_students(db: DbSession, scope: ScopeDep):
    return service.at_risk(db, scope)
