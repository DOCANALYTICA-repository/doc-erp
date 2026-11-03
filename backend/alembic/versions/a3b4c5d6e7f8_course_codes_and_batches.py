"""course codes on timetable slots and claim entries, and lab/tutorial batches

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-09-13 00:00:00.000000

Two facts the department's own timetable records and this schema did not.

`course_code` (COAF202-5, COM101-5, ...) is how a course is actually referred
to in every official document; the portal could only ever show the long
subject name. It is stored on the claim entry as well as the slot because a
claim is a record of what was missed, and a course re-coded next year must not
rewrite last year's claims.

`batch` is the more consequential of the two. A paper timetable splits a
subject across two batches taught by two different faculty. With no batch
column the timetable could only be filtered by programme/semester/section, so
every student was offered — and could raise a claim against — the other
batch's hours, which then routed to a faculty member who has never taught
them. NULL means the whole class sits in the slot, which is true of most.

All four columns are nullable: existing rows have no answer to either
question, and inventing one would be worse than leaving it blank.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3b4c5d6e7f8'
down_revision: Union[str, Sequence[str], None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('timetable_sessions', sa.Column('course_code', sa.String(), nullable=True))
    op.add_column('timetable_sessions', sa.Column('batch', sa.String(), nullable=True))
    op.add_column('attendance_entries', sa.Column('course_code', sa.String(), nullable=True))
    op.add_column('users', sa.Column('batch', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'batch')
    op.drop_column('attendance_entries', 'course_code')
    op.drop_column('timetable_sessions', 'batch')
    op.drop_column('timetable_sessions', 'course_code')
