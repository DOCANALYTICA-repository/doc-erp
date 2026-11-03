"""co-taught timetable slots: a second teacher on a slot and on its claim entries

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-11-03 00:00:00.000000

The department's sheet lists some courses as taught by two people ("Nisha /
Thirunavukkarasu"). A slot could name only one, so every claim for that hour
went to one of them and the other could never see or sign it.

`co_faculty_id` is nullable on both tables: a single-teacher slot, which is
nearly all of them, has no second teacher. On the claim entry it is copied
from the slot at submission, like course_code. Either teacher may sign the
hour, and one signature clears it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd3e4f5a6b7c8'
down_revision: Union[str, Sequence[str], None] = 'c2d3e4f5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('timetable_sessions') as batch:
        batch.add_column(sa.Column('co_faculty_id', sa.String(), nullable=True))
        batch.create_foreign_key('fk_timetable_sessions_co_faculty_id_users', 'users', ['co_faculty_id'], ['id'])
        batch.create_index('ix_timetable_sessions_co_faculty_id', ['co_faculty_id'])
    with op.batch_alter_table('attendance_entries') as batch:
        batch.add_column(sa.Column('co_faculty_id', sa.String(), nullable=True))
        batch.create_foreign_key('fk_attendance_entries_co_faculty_id_users', 'users', ['co_faculty_id'], ['id'])
        batch.create_index('ix_attendance_entries_co_faculty_id', ['co_faculty_id'])


def downgrade() -> None:
    with op.batch_alter_table('attendance_entries') as batch:
        batch.drop_index('ix_attendance_entries_co_faculty_id')
        batch.drop_constraint('fk_attendance_entries_co_faculty_id_users', type_='foreignkey')
        batch.drop_column('co_faculty_id')
    with op.batch_alter_table('timetable_sessions') as batch:
        batch.drop_index('ix_timetable_sessions_co_faculty_id')
        batch.drop_constraint('fk_timetable_sessions_co_faculty_id_users', type_='foreignkey')
        batch.drop_column('co_faculty_id')
