"""add version column to articles for optimistic locking

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-13

在 articles 表添加 version 字段实现乐观锁，
防止并发更新同一篇文章时丢失修改（lost update）。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "articles",
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False, comment="乐观锁版本号"),
    )


def downgrade() -> None:
    op.drop_column("articles", "version")
