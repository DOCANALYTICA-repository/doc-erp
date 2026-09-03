"""performance indexes: 43 foreign-key columns plus 14 composites

Revision ID: b7c1d2e3f4a5
Revises: a1b2c3d4e5f6
Create Date: 2026-09-03 00:00:00.000000

Not one foreign-key column in this schema had an index. Postgres does NOT
create them automatically (only the referenced side gets one, via the primary
key), so every join and every `WHERE <fk> = ?` was a sequential scan.

The single-column indexes below are mechanical. The composites are not: each
one was chosen from an actual query shape in the application, named in the
comment beside it.

CONCURRENCY: on PostgreSQL these are created with CONCURRENTLY inside an
autocommit block, so building them does not take an exclusive lock and the
application keeps serving. CONCURRENTLY is not permitted inside a transaction,
which is what the autocommit_block() is for. SQLite has neither concept and
takes the plain path.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7c1d2e3f4a5'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (index_name, table, [columns])
FK_INDEXES = [
    ('ix_announcements_author_id', 'announcements', ['author_id']),
    ('ix_announcements_club_id', 'announcements', ['club_id']),
    ('ix_annual_plans_club_id', 'annual_plans', ['club_id']),
    ('ix_annual_plans_submitted_by', 'annual_plans', ['submitted_by']),
    ('ix_attendance_entries_claim_participant_id', 'attendance_entries', ['claim_participant_id']),
    ('ix_attendance_entries_subject_faculty_id', 'attendance_entries', ['subject_faculty_id']),
    ('ix_budgets_club_id', 'budgets', ['club_id']),
    ('ix_claim_participants_claim_id', 'claim_participants', ['claim_id']),
    ('ix_claim_participants_student_id', 'claim_participants', ['student_id']),
    ('ix_claims_club_id', 'claims', ['club_id']),
    ('ix_claims_last_revised_by', 'claims', ['last_revised_by']),
    ('ix_claims_submitted_by', 'claims', ['submitted_by']),
    ('ix_club_documents_club_id', 'club_documents', ['club_id']),
    ('ix_club_documents_previous_version_id', 'club_documents', ['previous_version_id']),
    ('ix_club_documents_uploaded_by', 'club_documents', ['uploaded_by']),
    ('ix_club_hierarchy_levels_club_id', 'club_hierarchy_levels', ['club_id']),
    ('ix_club_members_club_id', 'club_members', ['club_id']),
    ('ix_club_members_hierarchy_level_id', 'club_members', ['hierarchy_level_id']),
    ('ix_club_members_student_id', 'club_members', ['student_id']),
    ('ix_dashboard_widget_preferences_owner_id', 'dashboard_widget_preferences', ['owner_id']),
    ('ix_documents_owner_id', 'documents', ['owner_id']),
    ('ix_event_attendance_event_id', 'event_attendance', ['event_id']),
    ('ix_event_attendance_student_id', 'event_attendance', ['student_id']),
    ('ix_events_club_id', 'events', ['club_id']),
    ('ix_faculty_assignments_club_id', 'faculty_assignments', ['club_id']),
    ('ix_faculty_assignments_faculty_id', 'faculty_assignments', ['faculty_id']),
    ('ix_meetings_club_id', 'meetings', ['club_id']),
    ('ix_meetings_organizer_id', 'meetings', ['organizer_id']),
    ('ix_notes_owner_id', 'notes', ['owner_id']),
    ('ix_notifications_task_id', 'notifications', ['task_id']),
    ('ix_notifications_user_id', 'notifications', ['user_id']),
    ('ix_recruitment_applications_applicant_id', 'recruitment_applications', ['applicant_id']),
    ('ix_recruitment_applications_drive_id', 'recruitment_applications', ['drive_id']),
    ('ix_recruitment_drives_club_id', 'recruitment_drives', ['club_id']),
    ('ix_reimbursements_club_id', 'reimbursements', ['club_id']),
    ('ix_reimbursements_event_id', 'reimbursements', ['event_id']),
    ('ix_reimbursements_requested_by', 'reimbursements', ['requested_by']),
    ('ix_reminders_owner_id', 'reminders', ['owner_id']),
    ('ix_sponsorships_club_id', 'sponsorships', ['club_id']),
    ('ix_supporting_documents_claim_id', 'supporting_documents', ['claim_id']),
    ('ix_tasks_assignee_id', 'tasks', ['assignee_id']),
    ('ix_tasks_creator_id', 'tasks', ['creator_id']),
    ('ix_timetable_sessions_faculty_id', 'timetable_sessions', ['faculty_id']),
]

COMPOSITE_INDEXES = [
    # claims.py list queries
    ('ix_claims_current_workflow_stage_submission_type', 'claims', ['current_workflow_stage', 'submission_type']),
    # notification.get_unread_for_user
    ('ix_notifications_user_id_is_read_created_at', 'notifications', ['user_id', 'is_read', 'created_at']),
    # every faculty_scope call
    ('ix_faculty_assignments_faculty_id_role_tag_status', 'faculty_assignments', ['faculty_id', 'role_tag', 'status']),
    # get_club_coordinator_club_ids
    ('ix_faculty_assignments_club_id_role_tag_status', 'faculty_assignments', ['club_id', 'role_tag', 'status']),
    # _claims_pending_for_subject_faculty
    ('ix_attendance_entries_subject_faculty_id_status', 'attendance_entries', ['subject_faculty_id', 'status']),
    # task lists
    ('ix_tasks_assignee_id_status', 'tasks', ['assignee_id', 'status']),
    # task_repo.get_by_related_entity
    ('ix_tasks_related_entity_type_related_entity_id', 'tasks', ['related_entity_type', 'related_entity_id']),
    # the guard on every club write
    ('ix_club_members_student_id_status', 'club_members', ['student_id', 'status']),
    # roster + membership guard
    ('ix_club_members_club_id_status', 'club_members', ['club_id', 'status']),
    # faculty document lists
    ('ix_documents_owner_id_is_link_revoked', 'documents', ['owner_id', 'is_link_revoked']),
    # public share lookup - not even a FK, no index today
    ('ix_documents_shared_link', 'documents', ['shared_link']),
    # the timetable read behind every claim
    ('ix_timetable_sessions_programme_semester_section_day_of_week', 'timetable_sessions', ['programme', 'semester', 'section', 'day_of_week']),
    # users.py directory scans the whole table
    ('ix_users_primary_role', 'users', ['primary_role']),
    # the reviewer inbox
    ('ix_annual_plans_status', 'annual_plans', ['status']),
]

ALL_INDEXES = FK_INDEXES + COMPOSITE_INDEXES


def _is_postgres() -> bool:
    return op.get_context().dialect.name == "postgresql"


def upgrade() -> None:
    if _is_postgres():
        # CONCURRENTLY cannot run inside a transaction.
        with op.get_context().autocommit_block():
            for name, table, cols in ALL_INDEXES:
                op.create_index(
                    name, table, cols, unique=False,
                    postgresql_concurrently=True, if_not_exists=True,
                )
        return

    for name, table, cols in ALL_INDEXES:
        op.create_index(name, table, cols, unique=False, if_not_exists=True)


def downgrade() -> None:
    if _is_postgres():
        with op.get_context().autocommit_block():
            for name, table, _cols in reversed(ALL_INDEXES):
                op.drop_index(
                    name, table_name=table,
                    postgresql_concurrently=True, if_exists=True,
                )
        return

    for name, table, _cols in reversed(ALL_INDEXES):
        op.drop_index(name, table_name=table, if_exists=True)
