"""message edit/delete + attachments

Revision ID: 007afedc603d
Revises: 6bfdbc947acc
Create Date: 2026-05-31 11:58:20.409269

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '007afedc603d'
down_revision: Union[str, None] = '6bfdbc947acc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('direct_messages', schema=None) as batch_op:
        batch_op.add_column(sa.Column('attachment_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('attachment_name', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('attachment_type', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('attachment_size', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('is_edited', sa.Boolean(), nullable=False))
        batch_op.add_column(sa.Column('is_deleted', sa.Boolean(), nullable=False))
        batch_op.add_column(sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.alter_column('text',
               existing_type=sa.TEXT(),
               nullable=True)



def downgrade() -> None:
    with op.batch_alter_table('direct_messages', schema=None) as batch_op:
        batch_op.alter_column('text',
               existing_type=sa.TEXT(),
               nullable=False)
        batch_op.drop_column('edited_at')
        batch_op.drop_column('is_deleted')
        batch_op.drop_column('is_edited')
        batch_op.drop_column('attachment_size')
        batch_op.drop_column('attachment_type')
        batch_op.drop_column('attachment_name')
        batch_op.drop_column('attachment_url')

