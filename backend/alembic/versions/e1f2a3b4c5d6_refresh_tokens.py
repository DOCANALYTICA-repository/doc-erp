"""refresh tokens, so a session can actually be ended

Revision ID: e1f2a3b4c5d6
Revises: d9e3f4a5b6c7
Create Date: 2026-09-04 00:00:00.000000

The access token lived for EIGHT DAYS and a JWT is valid until it expires, so
a leaked one was a week-long session that nothing could call back. Shortening
it to 30 minutes is only tolerable alongside a refresh path, and a refresh
path is only safe if it can be revoked — which means server-side state.

Tokens are stored BY HASH: a leak of this table hands out nothing.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, Sequence[str], None] = 'd9e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'refresh_tokens',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('token_hash', sa.String(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('replaced_by_id', sa.String(), nullable=True),
        sa.Column('user_agent', sa.String(), nullable=True),
        sa.Column('is_revoked', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_refresh_tokens_id'), 'refresh_tokens', ['id'], unique=False)
    op.create_index(op.f('ix_refresh_tokens_user_id'), 'refresh_tokens', ['user_id'], unique=False)
    op.create_index(op.f('ix_refresh_tokens_token_hash'), 'refresh_tokens', ['token_hash'], unique=False)
    # "Every live session for this user" — the query behind logout-everywhere.
    op.create_index(
        'ix_refresh_tokens_user_id_is_revoked', 'refresh_tokens',
        ['user_id', 'is_revoked'], unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_refresh_tokens_user_id_is_revoked', table_name='refresh_tokens')
    op.drop_index(op.f('ix_refresh_tokens_token_hash'), table_name='refresh_tokens')
    op.drop_index(op.f('ix_refresh_tokens_user_id'), table_name='refresh_tokens')
    op.drop_index(op.f('ix_refresh_tokens_id'), table_name='refresh_tokens')
    op.drop_table('refresh_tokens')
