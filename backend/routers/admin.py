from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from db_models import User, RoleEnum
from schemas import UserCreate, UserOut
from security import hash_password
from deps import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/doctors", response_model=list[UserOut])
def list_doctors(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return db.query(User).filter(User.role == RoleEnum.doctor).all()


@router.post("/doctors", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_doctor(
    payload: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=RoleEnum.doctor,
        created_by_id=admin.id,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.patch("/doctors/{user_id}/deactivate", response_model=UserOut)
def deactivate_doctor(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_active = False
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.patch("/doctors/{user_id}/activate", response_model=UserOut)
def activate_doctor(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_active = True
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)
