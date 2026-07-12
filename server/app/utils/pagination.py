"""游标分页工具：基于 created_at + id 的 cursor 分页。"""
import base64
import json
from datetime import datetime
from typing import Optional, Tuple

from sqlalchemy import select, and_, or_
from sqlalchemy.sql import Select


def encode_cursor(created_at: datetime, item_id: int) -> str:
    """编码游标。"""
    raw = json.dumps({"t": created_at.isoformat(), "i": item_id})
    return base64.urlsafe_b64encode(raw.encode()).decode()


def decode_cursor(cursor: str) -> Tuple[datetime, int]:
    """解码游标。"""
    raw = base64.urlsafe_b64decode(cursor.encode()).decode()
    data = json.loads(raw)
    return datetime.fromisoformat(data["t"]), data["i"]


def apply_cursor(stmt: Select, cursor: Optional[str], created_at_col, id_col):
    """对查询应用游标条件（按 created_at DESC, id DESC 排序，取下一页）。

    返回应用了过滤后的 stmt。
    """
    if not cursor:
        return stmt
    cursor_time, cursor_id = decode_cursor(cursor)
    # created_at < cursor_time OR (created_at == cursor_time AND id < cursor_id)
    return stmt.where(
        or_(
            created_at_col < cursor_time,
            and_(created_at_col == cursor_time, id_col < cursor_id),
        )
    )
