"""add comment flags columns for AI review

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-14

在 comments 表添加 is_flagged / flagged_reason 字段，
用于存储 AI 评论审核结果。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "comments",
        sa.Column("is_flagged", sa.Boolean(), server_default=sa.text("0"), nullable=False, comment="AI 审核标记"),
    )
    op.add_column(
        "comments",
        sa.Column("flagged_reason", sa.String(255), nullable=True, comment="违规原因"),
    )


def downgrade() -> None:
    op.drop_column("comments", "flagged_reason")
    op.drop_column("comments", "is_flagged")
