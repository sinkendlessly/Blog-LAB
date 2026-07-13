"""add unique constraint to interactions

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-13

在 interactions 表上添加联合唯一约束，防止并发下单
TOCTOU 竞态产生的重复点赞/收藏/分享记录。

UNIQUE KEY (user_id, target_id, target_type, action)
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 先清理已有的重复数据（如果存在），保留最新一条
    op.execute("""
        DELETE t1 FROM interactions t1
        INNER JOIN interactions t2
        WHERE t1.id < t2.id
          AND t1.user_id = t2.user_id
          AND t1.target_id = t2.target_id
          AND t1.target_type = t2.target_type
          AND t1.action = t2.action
    """)
    # 创建唯一约束
    op.create_unique_constraint(
        "uq_interactions_user_target_action",
        "interactions",
        ["user_id", "target_id", "target_type", "action"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_interactions_user_target_action",
        "interactions",
        type_="unique",
    )
