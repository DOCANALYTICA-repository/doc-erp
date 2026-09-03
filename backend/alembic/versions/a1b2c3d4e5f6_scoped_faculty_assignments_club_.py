"""scoped faculty assignments, club hierarchy levels, claim scoping/resubmit columns

Revision ID: a1b2c3d4e5f6
Revises: ce5e509248d3
Create Date: 2026-07-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'ce5e509248d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_LEVELS = [(10, "President"), (20, "Vice President"), (30, "Core Member"), (40, "Member")]


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('faculty_assignments',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('faculty_id', sa.String(), nullable=False),
    sa.Column('role_tag', sa.String(), nullable=False),
    sa.Column('programme', sa.String(), nullable=True),
    sa.Column('semester', sa.String(), nullable=True),
    sa.Column('section', sa.String(), nullable=True),
    sa.Column('club_id', sa.String(), nullable=True),
    sa.Column('status', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['faculty_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['club_id'], ['clubs.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_faculty_assignments_id'), 'faculty_assignments', ['id'], unique=False)

    op.create_table('club_hierarchy_levels',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('club_id', sa.String(), nullable=False),
    sa.Column('level_order', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['club_id'], ['clubs.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_club_hierarchy_levels_id'), 'club_hierarchy_levels', ['id'], unique=False)

    # SQLite has no ALTER TABLE ... ADD CONSTRAINT, so every add_column that
    # carries a foreign key has to go through batch mode (which recreates the
    # table). Postgres executes the same statements natively.
    with op.batch_alter_table('club_members') as batch_op:
        batch_op.add_column(sa.Column('hierarchy_level_id', sa.String(), nullable=True))
        batch_op.create_foreign_key(
            'fk_club_members_hierarchy_level', 'club_hierarchy_levels',
            ['hierarchy_level_id'], ['id'],
        )

    with op.batch_alter_table('claims') as batch_op:
        batch_op.add_column(sa.Column('club_id', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('revision_reason', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('last_revised_by', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('last_revised_stage', sa.String(), nullable=True))
        batch_op.create_foreign_key('fk_claims_club', 'clubs', ['club_id'], ['id'])
        batch_op.create_foreign_key(
            'fk_claims_last_revised_by', 'users', ['last_revised_by'], ['id'],
        )

    # --- Data backfill: every existing club gets a default 4-level
    # hierarchy, and every existing membership's hierarchy_level_id is set
    # by matching its existing free-text `role` column. Any legacy role
    # value that isn't one of the 4 known strings falls back to the bottom
    # level. Done with Core table reflection, not the ORM, per standard
    # Alembic practice. ---
    conn = op.get_bind()
    clubs_t = sa.table('clubs', sa.column('id', sa.String))
    levels_t = sa.table('club_hierarchy_levels',
                         sa.column('id', sa.String), sa.column('club_id', sa.String),
                         sa.column('level_order', sa.Integer), sa.column('title', sa.String),
                         sa.column('created_at', sa.DateTime), sa.column('updated_at', sa.DateTime))
    members_t = sa.table('club_members', sa.column('id', sa.String), sa.column('club_id', sa.String),
                          sa.column('role', sa.String), sa.column('hierarchy_level_id', sa.String))

    now = sa.func.now()
    club_ids = [row[0] for row in conn.execute(sa.select(clubs_t.c.id))]
    for club_id in club_ids:
        level_id_by_title = {}
        for level_order, title in DEFAULT_LEVELS:
            level_id = f"chl_{club_id}_{level_order}"
            level_id_by_title[title] = level_id
            conn.execute(levels_t.insert().values(
                id=level_id, club_id=club_id, level_order=level_order, title=title,
                created_at=now, updated_at=now,
            ))

        members = conn.execute(
            sa.select(members_t.c.id, members_t.c.role).where(members_t.c.club_id == club_id)
        )
        for member_id, role in members:
            level_id = level_id_by_title.get(role)
            if level_id is None:
                print(f"WARNING: club_member {member_id} has unrecognized role '{role}' — defaulting to bottom level")
                level_id = level_id_by_title["Member"]
            conn.execute(
                members_t.update().where(members_t.c.id == member_id).values(hierarchy_level_id=level_id)
            )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('claims') as batch_op:
        batch_op.drop_constraint('fk_claims_last_revised_by', type_='foreignkey')
        batch_op.drop_constraint('fk_claims_club', type_='foreignkey')
        batch_op.drop_column('last_revised_stage')
        batch_op.drop_column('last_revised_by')
        batch_op.drop_column('revision_reason')
        batch_op.drop_column('club_id')

    with op.batch_alter_table('club_members') as batch_op:
        batch_op.drop_constraint('fk_club_members_hierarchy_level', type_='foreignkey')
        batch_op.drop_column('hierarchy_level_id')

    op.drop_index(op.f('ix_club_hierarchy_levels_id'), table_name='club_hierarchy_levels')
    op.drop_table('club_hierarchy_levels')

    op.drop_index(op.f('ix_faculty_assignments_id'), table_name='faculty_assignments')
    op.drop_table('faculty_assignments')
