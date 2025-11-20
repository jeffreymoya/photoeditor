"""
Test TaskCliContext dataclass.

Validates immutability, copy methods, and factory instantiation.
"""

import pytest
from dataclasses import FrozenInstanceError
from pathlib import Path
from unittest.mock import Mock, patch

from tasks_cli.context import TaskCliContext
from tasks_cli.context_store import TaskContextStore
from tasks_cli.datastore import TaskDatastore
from tasks_cli.graph import DependencyGraph
from tasks_cli.picker import TaskPicker


# ============================================================================
# Test: Immutability
# ============================================================================


def test_context_frozen():
    """Verify TaskCliContext is immutable (frozen dataclass)."""
    # Create mock dependencies
    repo_root = Path("/fake/repo")
    datastore = Mock(spec=TaskDatastore)
    graph = Mock(spec=DependencyGraph)
    picker = Mock(spec=TaskPicker)
    context_store = Mock(spec=TaskContextStore)
    output_channel = Mock()

    # Create context
    ctx = TaskCliContext(
        repo_root=repo_root,
        datastore=datastore,
        graph=graph,
        picker=picker,
        context_store=context_store,
        output_channel=output_channel,
    )

    # Attempt to mutate should raise FrozenInstanceError
    with pytest.raises(FrozenInstanceError):
        ctx.repo_root = Path("/other/repo")  # type: ignore

    with pytest.raises(FrozenInstanceError):
        ctx.datastore = Mock()  # type: ignore

    with pytest.raises(FrozenInstanceError):
        ctx.graph = Mock()  # type: ignore


# ============================================================================
# Test: with_output() creates new instance
# ============================================================================


def test_with_output_returns_copy():
    """Verify with_output() returns new instance with replaced output."""
    # Create original context
    repo_root = Path("/fake/repo")
    datastore = Mock(spec=TaskDatastore)
    graph = Mock(spec=DependencyGraph)
    picker = Mock(spec=TaskPicker)
    context_store = Mock(spec=TaskContextStore)
    original_output = Mock()

    ctx = TaskCliContext(
        repo_root=repo_root,
        datastore=datastore,
        graph=graph,
        picker=picker,
        context_store=context_store,
        output_channel=original_output,
    )

    # Create new output channel
    new_output = Mock()

    # Call with_output
    new_ctx = ctx.with_output(new_output)

    # Verify new instance created
    assert new_ctx is not ctx
    assert new_ctx.output_channel is new_output
    assert new_ctx.output_channel is not original_output

    # Verify other fields unchanged
    assert new_ctx.repo_root == ctx.repo_root
    assert new_ctx.datastore is ctx.datastore
    assert new_ctx.graph is ctx.graph
    assert new_ctx.picker is ctx.picker
    assert new_ctx.context_store is ctx.context_store

    # Verify original unchanged
    assert ctx.output_channel is original_output


# ============================================================================
# Test: with_temp_graph() creates new instance
# ============================================================================


def test_with_temp_graph_returns_copy():
    """Verify with_temp_graph() returns new instance with replaced graph."""
    # Create original context
    repo_root = Path("/fake/repo")
    datastore = Mock(spec=TaskDatastore)
    original_graph = Mock(spec=DependencyGraph)
    picker = Mock(spec=TaskPicker)
    context_store = Mock(spec=TaskContextStore)
    output_channel = Mock()

    ctx = TaskCliContext(
        repo_root=repo_root,
        datastore=datastore,
        graph=original_graph,
        picker=picker,
        context_store=context_store,
        output_channel=output_channel,
    )

    # Create new graph
    new_graph = Mock(spec=DependencyGraph)

    # Call with_temp_graph
    new_ctx = ctx.with_temp_graph(new_graph)

    # Verify new instance created
    assert new_ctx is not ctx
    assert new_ctx.graph is new_graph
    assert new_ctx.graph is not original_graph

    # Verify other fields unchanged
    assert new_ctx.repo_root == ctx.repo_root
    assert new_ctx.datastore is ctx.datastore
    assert new_ctx.picker is ctx.picker
    assert new_ctx.context_store is ctx.context_store
    assert new_ctx.output_channel is ctx.output_channel

    # Verify original unchanged
    assert ctx.graph is original_graph


# ============================================================================
# Test: from_repo_root() factory
# ============================================================================


def test_from_repo_root_factory(tmp_path):
    """Verify from_repo_root() instantiates all dependencies."""
    # Create fake repo structure
    repo_root = tmp_path / "repo"
    repo_root.mkdir()

    tasks_dir = repo_root / "tasks"
    tasks_dir.mkdir()

    cache_dir = tasks_dir / ".cache"
    cache_dir.mkdir()

    context_root = repo_root / ".agent-output"
    context_root.mkdir()

    # Create minimal task file
    task_file = tasks_dir / "TASK-0001-test.task.yaml"
    task_file.write_text(
        """id: TASK-0001
title: Test Task
status: todo
priority: P2
blocked_by: []
depends_on: []
"""
    )

    # Call factory
    ctx = TaskCliContext.from_repo_root(repo_root)

    # Verify all dependencies instantiated
    assert ctx.repo_root == repo_root
    assert isinstance(ctx.datastore, TaskDatastore)
    assert isinstance(ctx.graph, DependencyGraph)
    assert isinstance(ctx.picker, TaskPicker)
    assert isinstance(ctx.context_store, TaskContextStore)
    assert ctx.output_channel is not None

    # Verify datastore configured correctly
    assert ctx.datastore.repo_root == repo_root
    assert ctx.datastore.cache_dir == cache_dir

    # Verify context store configured correctly
    assert ctx.context_store.repo_root == repo_root
    assert ctx.context_store.context_root == context_root


# ============================================================================
# Test: from_repo_root() with output module
# ============================================================================


def test_from_repo_root_uses_output_module(tmp_path):
    """Verify from_repo_root() sets output_channel to output module."""
    # Create fake repo structure
    repo_root = tmp_path / "repo"
    repo_root.mkdir()

    tasks_dir = repo_root / "tasks"
    tasks_dir.mkdir()

    cache_dir = tasks_dir / ".cache"
    cache_dir.mkdir()

    context_root = repo_root / ".agent-output"
    context_root.mkdir()

    # Create minimal task file
    task_file = tasks_dir / "TASK-0001-test.task.yaml"
    task_file.write_text(
        """id: TASK-0001
title: Test Task
status: todo
priority: P2
blocked_by: []
depends_on: []
"""
    )

    # Call factory
    ctx = TaskCliContext.from_repo_root(repo_root)

    # Verify output_channel is the output module
    # We can check it has the expected output module functions
    assert hasattr(ctx.output_channel, "print_json")
    assert hasattr(ctx.output_channel, "print_warning")
    assert hasattr(ctx.output_channel, "set_json_mode")
    assert callable(ctx.output_channel.print_json)
    assert callable(ctx.output_channel.print_warning)
    assert callable(ctx.output_channel.set_json_mode)
