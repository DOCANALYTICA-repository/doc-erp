from typing import Any, Dict, Generic, List, Optional, Type, TypeVar, Union
from sqlalchemy.orm import Session
from app.models.base import Base

ModelType = TypeVar("ModelType", bound=Base)

class BaseRepository(Generic[ModelType]):
    def __init__(self, model: Type[ModelType]):
        self.model = model

    def get(self, db: Session, id: Any) -> Optional[ModelType]:
        return db.query(self.model).filter(self.model.id == id).first()

    def get_multi(self, db: Session, *, skip: int = 0, limit: Optional[int] = None) -> List[ModelType]:
        """List rows. `limit=None` means unbounded — and that is the default.

        It used to default to 100 with no ORDER BY, which silently truncated
        every list in the application. The sharpest case: the club selector
        fetched the first 100 clubs and then filtered them in Python, so a user
        whose only membership was club #101 got an empty selector and no error
        of any kind.
        """
        query = db.query(self.model)
        # A stable order, always. Paging without ORDER BY can return the same
        # row on two pages and skip another entirely; and even unpaged, an
        # unordered list visibly reshuffles between loads on Postgres.
        if hasattr(self.model, "name"):
            query = query.order_by(self.model.name, self.model.id)
        else:
            query = query.order_by(self.model.id)
        query = query.offset(skip)
        if limit is not None:
            query = query.limit(limit)
        return query.all()

    def create(self, db: Session, *, obj_in: Dict[str, Any]) -> ModelType:
        db_obj = self.model(**obj_in)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(self, db: Session, *, db_obj: ModelType, obj_in: Union[Dict[str, Any], Any]) -> ModelType:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            # exclude_unset is the whole point: obj_in.__dict__ contains EVERY
            # field on the schema, so a partial body like {"status": "..."}
            # also wrote title=None, due_date=None, priority=None. That is a
            # NOT NULL violation and a 500 — which is why club "Mark Done" has
            # never worked since it shipped. On a nullable column it would have
            # been worse: a silent wipe instead of an error.
            update_data = obj_in.model_dump(exclude_unset=True)

            
        for field in update_data:
            if hasattr(db_obj, field):
                setattr(db_obj, field, update_data[field])
                
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def remove(self, db: Session, *, id: Any) -> Optional[ModelType]:
        obj = db.query(self.model).get(id)
        if obj:
            db.delete(obj)
            db.commit()
        return obj
