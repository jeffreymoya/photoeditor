"""
Custom exceptions for task workflow automation.
"""

from typing import List


class WorkflowHaltError(Exception):
    """
    Raised when workflow must stop for manual intervention.

    This exception signals that the task workflow has encountered a condition
    that requires human attention before automation can continue.

    Attributes:
        halt_type: Type of halt condition (e.g., "blocked_unblocker")
        task_ids: List of task IDs involved in the halt condition
        message: Human-readable description of the halt condition
    """

    def __init__(self, message: str, halt_type: str, task_ids: List[str]):
        """
        Initialize WorkflowHaltError.

        Args:
            message: Human-readable description of the halt condition
            halt_type: Type of halt (e.g., "blocked_unblocker")
            task_ids: List of task IDs that caused the halt
        """
        super().__init__(message)
        self.halt_type = halt_type
        self.task_ids = task_ids
