import uuid
from sqlalchemy.orm import Session
from app.models.faculty import Task
from app.services.engines.notification import notification_engine

class TaskEngine:
    def create_task(
        self,
        db: Session,
        *,
        title: str,
        description: str,
        due_date: str,
        priority: str,
        assignee_id: str,
        creator_id: str,
        source_module: str,
        related_entity_type: str = None,
        related_entity_id: str = None
    ) -> Task:
        """
        Spawns a new task entity, assigning it to a user. Every task
        producer gets a real "Assigned" notification for free from here
        (Master Plan §26.5 / §44's Task -> Notification chain) rather than
        each module having to remember to call the Notification Engine
        itself after creating a task.
        """
        task_in = {
            "id": f"task_{uuid.uuid4().hex[:12]}",
            "title": title,
            "description": description,
            "due_date": due_date,
            "priority": priority,
            "assignee_id": assignee_id,
            "creator_id": creator_id,
            "source_module": source_module,
            "related_entity_type": related_entity_type,
            "related_entity_id": related_entity_id,
            "status": "pending"
        }

        db_task = Task(**task_in)
        db.add(db_task)
        db.commit()
        db.refresh(db_task)

        if assignee_id != creator_id:
            notification_engine.send_notification(
                db, user_id=assignee_id, title="New task assigned",
                content=f"You've been assigned: {title}", source_module=source_module,
                task_id=db_task.id,
            )
        return db_task

    def sync_meeting_action_items(
        self,
        db: Session,
        *,
        meeting_id: str,
        organizer_id: str,
        action_items: list[dict] # list of dicts: {"title": str, "assignee_id": str, "due_date": str}
    ) -> list[Task]:
        """
        Converts meeting action items into individual Tasks.
        """
        spawned_tasks = []
        for item in action_items:
            task = self.create_task(
                db,
                title=item["title"],
                description=f"Action item generated from meeting: {meeting_id}",
                due_date=item.get("due_date", "2026-12-31"),
                priority="medium",
                assignee_id=item["assignee_id"],
                creator_id=organizer_id,
                source_module="faculty",
                related_entity_type="meeting",
                related_entity_id=meeting_id
            )
            spawned_tasks.append(task)
        return spawned_tasks

task_engine = TaskEngine()
