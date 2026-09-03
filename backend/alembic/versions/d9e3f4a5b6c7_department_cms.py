"""programmes and gallery images move out of Python and into the database

Revision ID: d9e3f4a5b6c7
Revises: c8d2e3f4a5b6
Create Date: 2026-09-03 00:00:00.000000

The three course descriptions were a hardcoded list in content.py whose
brochure_urls pointed at PDFs that exist nowhere in the repository, and all
four gallery photographs were picsum.photos placeholders. get_club_showcase()
was already correctly DB-backed; these follow the same pattern.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd9e3f4a5b6c7'
down_revision: Union[str, Sequence[str], None] = 'c8d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'programmes',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('brochure_url', sa.String(), nullable=True),
        sa.Column('outcomes', sa.String(), nullable=False, server_default=''),
        sa.Column('careers', sa.String(), nullable=False, server_default=''),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_published', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_programmes_id'), 'programmes', ['id'], unique=False)

    op.create_table(
        'gallery_images',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('url', sa.String(), nullable=False),
        sa.Column('caption', sa.String(), nullable=True),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_published', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_gallery_images_id'), 'gallery_images', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_gallery_images_id'), table_name='gallery_images')
    op.drop_table('gallery_images')
    op.drop_index(op.f('ix_programmes_id'), table_name='programmes')
    op.drop_table('programmes')
