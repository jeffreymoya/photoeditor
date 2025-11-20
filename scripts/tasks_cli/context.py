"""
Task CLI context management.

Provides a frozen dataclass that encapsulates all CLI dependencies
(datastore, graph, picker, context store, output channel) for passing
through the Typer command chain.

Implements immutability pattern with .with_* copy methods for swapping
dependencies in specific contexts (e.g., temporary graphs for validation).
"""

from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

from .context_store import TaskContextStore
from .datastore import TaskDatastore
from .graph import DependencyGraph
from .picker import TaskPicker


@dataclass(frozen=True)
class TaskCliContext:
    """
    Immutable context for task CLI commands.

    Encapsulates all dependencies needed by commands:
    - repo_root: Repository root path
    - datastore: Task metadata cache
    - graph: Dependency graph
    - picker: Task prioritization engine
    - context_store: Agent coordination state
    - output_channel: Output formatter (from output module)

    All fields are frozen to prevent accidental mutation. Use .with_* methods
    to create modified copies when needed.
    """

    repo_root: Path
    datastore: TaskDatastore
    graph: DependencyGraph
    picker: TaskPicker
    context_store: TaskContextStore
    output_channel: Any  # Type: output module or mock, kept as Any for flexibility

    def with_output(self, channel: Any) -> "TaskCliContext":
        """
        Create new context with replaced output channel.

        Args:
            channel: New output channel (from output module)

        Returns:
            New TaskCliContext instance with updated output_channel
        """
        return replace(self, output_channel=channel)

    def with_temp_graph(self, graph: DependencyGraph) -> "TaskCliContext":
        """
        Create new context with replaced dependency graph.

        Useful for validation scenarios where a modified graph is needed
        temporarily without affecting the main context.

        Args:
            graph: New dependency graph

        Returns:
            New TaskCliContext instance with updated graph
        """
        return replace(self, graph=graph)

    @classmethod
    def from_repo_root(cls, repo_root: Path) -> "TaskCliContext":
        """
        Factory method to create context from repository root.

        Instantiates all dependencies:
        - TaskDatastore for cache management
        - Loads tasks from datastore
        - Builds DependencyGraph from tasks
        - Creates TaskPicker with tasks and graph
        - Initializes TaskContextStore for agent coordination
        - Sets up output module as default output channel

        Args:
            repo_root: Absolute path to repository root

        Returns:
            Fully initialized TaskCliContext
        """
        # Import output module here to avoid circular imports
        from . import output

        # Create datastore and load tasks
        datastore = TaskDatastore(repo_root)
        tasks = datastore.load_tasks()

        # Build dependency graph
        graph = DependencyGraph(tasks)

        # Create picker
        picker = TaskPicker(tasks, graph)

        # Initialize context store
        context_store = TaskContextStore(repo_root)

        # Return fully initialized context
        return cls(
            repo_root=repo_root,
            datastore=datastore,
            graph=graph,
            picker=picker,
            context_store=context_store,
            output_channel=output,
        )
