"""per-user email notification preferences

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-09-04 00:00:00.000000

Nothing reached anyone outside the application, and the approval workflows
depend on people noticing — which is the root cause the field audit found
behind BLK-01.

Defaults are deliberate:
  * email_on_action_required TRUE, because an opt-in default would leave
    exactly the problem this exists to solve.
  * email_daily_digest FALSE, because an unasked-for daily email is how a
    system teaches people to filter it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, Sequence[str], None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column(
        'email_on_action_required', sa.Boolean(), nullable=False, server_default=sa.true(),
    ))
    op.add_column('users', sa.Column(
        'email_daily_digest', sa.Boolean(), nullable=False, server_default=sa.false(),
    ))


def downgrade() -> None:
    op.drop_column('users', 'email_daily_digest')
    op.drop_column('users', 'email_on_action_required')
