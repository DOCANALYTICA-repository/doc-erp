"""per-club tiered access flags

Revision ID: b1c2d3e4f5a6
Revises: a3b4c5d6e7f8
Create Date: 2026-09-18 00:00:00.000000

DOC Analytica's real leadership structure (Core -> wing Directors -> wing
Associates) needs two behaviors no other club has asked for: only Core sees
the full tab set (Directors/Associates get a reduced one and only their own
reimbursements), and the Faculty Coordinator gets full read/write access
instead of the platform-wide default of oversight-only.

Both are opt-in per club, defaulting to False, because Faculty Coordinators
being oversight-only ("they do not draft events or request reimbursements")
is tested, documented, intentional behavior for every other club. These
columns exist so DOC Analytica can opt into a different policy without
changing what club_commerce/club_cultural (or any future club) does today.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, Sequence[str], None] = 'a3b4c5d6e7f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('clubs', sa.Column(
        'restrict_non_core_access', sa.Boolean(), nullable=False, server_default=sa.false(),
    ))
    op.add_column('clubs', sa.Column(
        'faculty_coordinator_full_access', sa.Boolean(), nullable=False, server_default=sa.false(),
    ))


def downgrade() -> None:
    op.drop_column('clubs', 'faculty_coordinator_full_access')
    op.drop_column('clubs', 'restrict_non_core_access')
