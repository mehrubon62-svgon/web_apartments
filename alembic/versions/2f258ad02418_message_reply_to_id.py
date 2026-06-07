"""message reply_to_id

Revision ID: 2f258ad02418
Revises: c03085a45ef5
Create Date: 2026-05-31 14:40:54.685217

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '2f258ad02418'
down_revision: Union[str, None] = 'c03085a45ef5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('direct_messages', schema=None) as batch_op:
        batch_op.add_column(sa.Column('reply_to_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(None, 'direct_messages', ['reply_to_id'], ['id'], ondelete='SET NULL')



def downgrade() -> None:
    with op.batch_alter_table('direct_messages', schema=None) as batch_op:
        batch_op.drop_constraint(None, type_='foreignkey')
        batch_op.drop_column('reply_to_id')

