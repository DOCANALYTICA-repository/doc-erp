from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import get_current_user
from app.repositories.faculty import task_repo
from app.schemas.task import TaskOut, TaskCreate, TaskUpdate
from app.models.user import User
import uuid

router = APIRouter()

@router.get("", response_model=List[TaskOut])
def get_user_tasks(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return task_repo.get_by_assignee(db, assignee_id=current_user.id)

@router.post("", response_model=TaskOut)
def create_task(task_in: TaskCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task_dict = task_in.dict()
    task_dict["id"] = f"task_{uuid.uuid4().hex[:12]}"
    task_dict["creator_id"] = current_user.id
    return task_repo.create(db, obj_in=task_dict)

@router.put("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: str,
    task_in: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_task = task_repo.get(db, task_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    if db_task.assignee_id != current_user.id and db_task.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this task")
        
    return task_repo.update(db, db_obj=db_task, obj_in=task_in)
