"""notifications carry what they are about

Revision ID: c8d2e3f4a5b6
Revises: b7c1d2e3f4a5
Create Date: 2026-09-03 00:00:00.000000

A notification used to name a claim's reference number in prose and stop
there — it told you something had happened and then left you to go and find
it. entity_type/entity_id let the card link straight to the thing.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c8d2e3f4a5b6'
down_revision: Union[str, Sequence[str], None] = 'b7c1d2e3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('notifications', sa.Column('entity_type', sa.String(), nullable=True))
    op.add_column('notifications', sa.Column('entity_id', sa.String(), nullable=True))
    op.create_index(
        'ix_notifications_entity_type_entity_id', 'notifications',
        ['entity_type', 'entity_id'], unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_notifications_entity_type_entity_id', table_name='notifications')
    op.drop_column('notifications', 'entity_id')
    op.drop_column('notifications', 'entity_type')
