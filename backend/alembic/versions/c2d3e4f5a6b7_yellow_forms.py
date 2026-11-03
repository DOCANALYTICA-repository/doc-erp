"""yellow forms: club pre-approvals and claim sheets

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-09-27 00:00:00.000000

Co-curricular attendance claims are filed by clubs, in two documents: a
pre-approval (event + students, approved by the club's Faculty Coordinator and
then the Associate HOD before the event starts) and, once the event is over,
one claim sheet against it (per student: dates, periods missed, and attendance
with and without claims) for the Claims Coordinator.

club_claim_sheets.pre_approval_id is UNIQUE: at most one sheet per
pre-approval.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, Sequence[str], None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'pre_approval_forms',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('reference_number', sa.String(), nullable=False),
        sa.Column('club_id', sa.String(), nullable=False),
        sa.Column('academic_year', sa.String(), nullable=False),
        sa.Column('event_name', sa.String(), nullable=False),
        sa.Column('event_description', sa.String(), nullable=True),
        sa.Column('venue', sa.String(), nullable=True),
        sa.Column('event_start_date', sa.String(), nullable=False),
        sa.Column('event_end_date', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('submitted_at', sa.String(), nullable=True),
        sa.Column('faculty_coordinator_approved_by', sa.String(), nullable=True),
        sa.Column('faculty_coordinator_approved_at', sa.String(), nullable=True),
        sa.Column('associate_hod_approved_by', sa.String(), nullable=True),
        sa.Column('associate_hod_approved_at', sa.String(), nullable=True),
        sa.Column('review_comments', sa.String(), nullable=True),
        sa.Column('last_reviewed_by', sa.String(), nullable=True),
        sa.Column('last_reviewed_stage', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['associate_hod_approved_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['club_id'], ['clubs.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['faculty_coordinator_approved_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['last_reviewed_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_pre_approval_forms_id'), 'pre_approval_forms', ['id'], unique=False)
    op.create_index(op.f('ix_pre_approval_forms_reference_number'), 'pre_approval_forms', ['reference_number'], unique=True)
    op.create_index(op.f('ix_pre_approval_forms_club_id'), 'pre_approval_forms', ['club_id'], unique=False)
    op.create_index(op.f('ix_pre_approval_forms_status'), 'pre_approval_forms', ['status'], unique=False)
    op.create_index(op.f('ix_pre_approval_forms_created_by'), 'pre_approval_forms', ['created_by'], unique=False)
    op.create_index(op.f('ix_pre_approval_forms_faculty_coordinator_approved_by'), 'pre_approval_forms', ['faculty_coordinator_approved_by'], unique=False)
    op.create_index(op.f('ix_pre_approval_forms_associate_hod_approved_by'), 'pre_approval_forms', ['associate_hod_approved_by'], unique=False)
    op.create_index(op.f('ix_pre_approval_forms_last_reviewed_by'), 'pre_approval_forms', ['last_reviewed_by'], unique=False)

    op.create_table(
        'club_claim_sheets',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('reference_number', sa.String(), nullable=False),
        sa.Column('pre_approval_id', sa.String(), nullable=False),
        sa.Column('club_id', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('submitted_at', sa.String(), nullable=True),
        sa.Column('late_submission_flag', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('reviewed_by', sa.String(), nullable=True),
        sa.Column('reviewed_at', sa.String(), nullable=True),
        sa.Column('review_comments', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['club_id'], ['clubs.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['pre_approval_id'], ['pre_approval_forms.id'], ),
        sa.ForeignKeyConstraint(['reviewed_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_club_claim_sheets_id'), 'club_claim_sheets', ['id'], unique=False)
    op.create_index(op.f('ix_club_claim_sheets_reference_number'), 'club_claim_sheets', ['reference_number'], unique=True)
    op.create_index(op.f('ix_club_claim_sheets_pre_approval_id'), 'club_claim_sheets', ['pre_approval_id'], unique=True)
    op.create_index(op.f('ix_club_claim_sheets_club_id'), 'club_claim_sheets', ['club_id'], unique=False)
    op.create_index(op.f('ix_club_claim_sheets_status'), 'club_claim_sheets', ['status'], unique=False)
    op.create_index(op.f('ix_club_claim_sheets_created_by'), 'club_claim_sheets', ['created_by'], unique=False)
    op.create_index(op.f('ix_club_claim_sheets_reviewed_by'), 'club_claim_sheets', ['reviewed_by'], unique=False)

    op.create_table(
        'pre_approval_students',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('pre_approval_id', sa.String(), nullable=False),
        sa.Column('student_id', sa.String(), nullable=True),
        sa.Column('register_number', sa.String(), nullable=False),
        sa.Column('student_name', sa.String(), nullable=False),
        sa.Column('class_name', sa.String(), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['pre_approval_id'], ['pre_approval_forms.id'], ),
        sa.ForeignKeyConstraint(['student_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('pre_approval_id', 'register_number', name='uq_pre_approval_students_register_number'),
    )
    op.create_index(op.f('ix_pre_approval_students_id'), 'pre_approval_students', ['id'], unique=False)
    op.create_index(op.f('ix_pre_approval_students_pre_approval_id'), 'pre_approval_students', ['pre_approval_id'], unique=False)
    op.create_index(op.f('ix_pre_approval_students_student_id'), 'pre_approval_students', ['student_id'], unique=False)

    op.create_table(
        'club_claim_students',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('sheet_id', sa.String(), nullable=False),
        sa.Column('pre_approval_student_id', sa.String(), nullable=False),
        sa.Column('student_id', sa.String(), nullable=True),
        sa.Column('register_number', sa.String(), nullable=False),
        sa.Column('student_name', sa.String(), nullable=False),
        sa.Column('class_name', sa.String(), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('attendance_with_claims', sa.Float(), nullable=True),
        sa.Column('attendance_without_claims', sa.Float(), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['pre_approval_student_id'], ['pre_approval_students.id'], ),
        sa.ForeignKeyConstraint(['sheet_id'], ['club_claim_sheets.id'], ),
        sa.ForeignKeyConstraint(['student_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('sheet_id', 'pre_approval_student_id', name='uq_club_claim_students_pre_approval_student'),
    )
    op.create_index(op.f('ix_club_claim_students_id'), 'club_claim_students', ['id'], unique=False)
    op.create_index(op.f('ix_club_claim_students_sheet_id'), 'club_claim_students', ['sheet_id'], unique=False)
    op.create_index(op.f('ix_club_claim_students_pre_approval_student_id'), 'club_claim_students', ['pre_approval_student_id'], unique=False)
    op.create_index(op.f('ix_club_claim_students_student_id'), 'club_claim_students', ['student_id'], unique=False)

    op.create_table(
        'club_claim_entries',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('claim_student_id', sa.String(), nullable=False),
        sa.Column('date', sa.String(), nullable=False),
        sa.Column('periods', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['claim_student_id'], ['club_claim_students.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('claim_student_id', 'date', name='uq_club_claim_entries_date'),
    )
    op.create_index(op.f('ix_club_claim_entries_id'), 'club_claim_entries', ['id'], unique=False)
    op.create_index(op.f('ix_club_claim_entries_claim_student_id'), 'club_claim_entries', ['claim_student_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_club_claim_entries_claim_student_id'), table_name='club_claim_entries')
    op.drop_index(op.f('ix_club_claim_entries_id'), table_name='club_claim_entries')
    op.drop_table('club_claim_entries')

    op.drop_index(op.f('ix_club_claim_students_student_id'), table_name='club_claim_students')
    op.drop_index(op.f('ix_club_claim_students_pre_approval_student_id'), table_name='club_claim_students')
    op.drop_index(op.f('ix_club_claim_students_sheet_id'), table_name='club_claim_students')
    op.drop_index(op.f('ix_club_claim_students_id'), table_name='club_claim_students')
    op.drop_table('club_claim_students')

    op.drop_index(op.f('ix_pre_approval_students_student_id'), table_name='pre_approval_students')
    op.drop_index(op.f('ix_pre_approval_students_pre_approval_id'), table_name='pre_approval_students')
    op.drop_index(op.f('ix_pre_approval_students_id'), table_name='pre_approval_students')
    op.drop_table('pre_approval_students')

    op.drop_index(op.f('ix_club_claim_sheets_reviewed_by'), table_name='club_claim_sheets')
    op.drop_index(op.f('ix_club_claim_sheets_created_by'), table_name='club_claim_sheets')
    op.drop_index(op.f('ix_club_claim_sheets_status'), table_name='club_claim_sheets')
    op.drop_index(op.f('ix_club_claim_sheets_club_id'), table_name='club_claim_sheets')
    op.drop_index(op.f('ix_club_claim_sheets_pre_approval_id'), table_name='club_claim_sheets')
    op.drop_index(op.f('ix_club_claim_sheets_reference_number'), table_name='club_claim_sheets')
    op.drop_index(op.f('ix_club_claim_sheets_id'), table_name='club_claim_sheets')
    op.drop_table('club_claim_sheets')

    op.drop_index(op.f('ix_pre_approval_forms_last_reviewed_by'), table_name='pre_approval_forms')
    op.drop_index(op.f('ix_pre_approval_forms_associate_hod_approved_by'), table_name='pre_approval_forms')
    op.drop_index(op.f('ix_pre_approval_forms_faculty_coordinator_approved_by'), table_name='pre_approval_forms')
    op.drop_index(op.f('ix_pre_approval_forms_created_by'), table_name='pre_approval_forms')
    op.drop_index(op.f('ix_pre_approval_forms_status'), table_name='pre_approval_forms')
    op.drop_index(op.f('ix_pre_approval_forms_club_id'), table_name='pre_approval_forms')
    op.drop_index(op.f('ix_pre_approval_forms_reference_number'), table_name='pre_approval_forms')
    op.drop_index(op.f('ix_pre_approval_forms_id'), table_name='pre_approval_forms')
    op.drop_table('pre_approval_forms')
