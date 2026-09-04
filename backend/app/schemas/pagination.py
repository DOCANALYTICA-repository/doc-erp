"""A paginated response envelope.

WHY OFFSET RATHER THAN KEYSET
------------------------------
Keyset ("cursor") pagination is the more rigorous choice: it cannot skip or
repeat a row when the underlying list changes between pages, which offset can.

It is not the right choice HERE, for two reasons:

  * A cursor cannot express "jump to page 7". The UI these endpoints feed is
    Astryx's Pagination, which is page-numbered, and a numbered control backed
    by a cursor is a lie.

  * The drift offset suffers from needs the list to change WHILE someone pages
    through it. These lists are a department's claims and members — they change
    on human timescales, and every list is ordered by a stable key with `id` as
    a tiebreak, so the ordering itself is deterministic.

The important half of W3.7 was removing the SILENT 100-row cap, which is done:
base.py is unbounded by default. This adds an EXPLICIT, visible limit with a
total attached, which is the opposite failure mode — the user can see there is
more.
"""
from typing import Generic, List, TypeVar

from pydantic import BaseModel

T = TypeVar("T")

DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 200


class Page(BaseModel, Generic[T]):
    items: List[T]

    #: Total matching rows, so the client can render "of 240" and size the
    #: control. A page count with no total is how a list silently truncates.
    total: int
    page: int
    page_size: int

    @property
    def total_pages(self) -> int:
        if self.page_size <= 0:
            return 1
        return max(1, -(-self.total // self.page_size))
