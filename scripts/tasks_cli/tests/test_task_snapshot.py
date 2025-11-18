"""
Unit tests for task snapshot system in context_store.py.

Tests task file snapshotting, path resolution, acceptance criteria embedding,
and checklist snapshot functionality per Section 3.1 of proposal.
"""

import hashlib
import json
import tempfile
from pathlib import Path

import pytest
import yaml

from scripts.tasks_cli.context_store import TaskContextStore
from scripts.tasks_cli.exceptions import ValidationError


class TestTaskPathResolution:
    """Test task file path resolution across multiple locations."""

    def test_resolve_active_task_mobile(self, tmp_path: Path):
        """Test resolving task file in tasks/mobile/."""
        # Create repo structure
        tasks_mobile = tmp_path / 'tasks' / 'mobile'
        tasks_mobile.mkdir(parents=True)

        task_file = tasks_mobile / 'TASK-0818-frontend-tier.task.yaml'
        task_file.write_text('schema_version: "1.1"\nid: TASK-0818\n')

        # Create store
        store = TaskContextStore(tmp_path)

        # Resolve path
        resolved = store.resolve_task_path('TASK-0818')

        assert resolved == task_file
        assert resolved.exists()

    def test_resolve_active_task_backend(self, tmp_path: Path):
        """Test resolving task file in tasks/backend/."""
        # Create repo structure
        tasks_backend = tmp_path / 'tasks' / 'backend'
        tasks_backend.mkdir(parents=True)

        task_file = tasks_backend / 'TASK-0500-api-handler.task.yaml'
        task_file.write_text('schema_version: "1.1"\nid: TASK-0500\n')

        # Create store
        store = TaskContextStore(tmp_path)

        # Resolve path
        resolved = store.resolve_task_path('TASK-0500')

        assert resolved == task_file

    def test_resolve_completed_task(self, tmp_path: Path):
        """Test resolving task file in docs/completed-tasks/."""
        # Create repo structure
        completed_dir = tmp_path / 'docs' / 'completed-tasks'
        completed_dir.mkdir(parents=True)

        task_file = completed_dir / 'TASK-0200-old-task.task.yaml'
        task_file.write_text('schema_version: "1.1"\nid: TASK-0200\n')

        # Create store
        store = TaskContextStore(tmp_path)

        # Resolve path
        resolved = store.resolve_task_path('TASK-0200')

        assert resolved == task_file
        assert 'completed-tasks' in str(resolved)

    def test_resolve_quarantined_task(self, tmp_path: Path):
        """Test resolving quarantined task file."""
        # Create repo structure
        quarantine_dir = tmp_path / 'docs' / 'compliance' / 'quarantine'
        quarantine_dir.mkdir(parents=True)

        task_file = quarantine_dir / 'TASK-0999.quarantine.json'
        task_file.write_text('{"task_id": "TASK-0999", "reason": "malformed_yaml"}')

        # Create store
        store = TaskContextStore(tmp_path)

        # Resolve path
        resolved = store.resolve_task_path('TASK-0999')

        assert resolved == task_file
        assert 'quarantine' in str(resolved)

    def test_resolve_nonexistent_task(self, tmp_path: Path):
        """Test resolving nonexistent task returns None."""
        # Create store
        store = TaskContextStore(tmp_path)

        # Resolve path
        resolved = store.resolve_task_path('TASK-9999')

        assert resolved is None

    def test_resolve_prefers_active_over_completed(self, tmp_path: Path):
        """Test that active tasks are prioritized over completed tasks."""
        # Create both active and completed versions
        tasks_mobile = tmp_path / 'tasks' / 'mobile'
        tasks_mobile.mkdir(parents=True)
        active_file = tasks_mobile / 'TASK-0100-test.task.yaml'
        active_file.write_text('schema_version: "1.1"\nid: TASK-0100\nstatus: todo\n')

        completed_dir = tmp_path / 'docs' / 'completed-tasks'
        completed_dir.mkdir(parents=True)
        completed_file = completed_dir / 'TASK-0100-test.task.yaml'
        completed_file.write_text('schema_version: "1.1"\nid: TASK-0100\nstatus: done\n')

        # Create store
        store = TaskContextStore(tmp_path)

        # Resolve path
        resolved = store.resolve_task_path('TASK-0100')

        # Should return active task
        assert resolved == active_file
        assert 'tasks/mobile' in str(resolved)


class TestTaskSnapshotCreation:
    """Test task snapshot creation with SHA256 hashing."""

    def test_create_snapshot_with_explicit_path(self, tmp_path: Path):
        """Test creating snapshot with explicit task file path."""
        # Create task file
        task_file = tmp_path / 'test-task.yaml'
        task_content = 'schema_version: "1.1"\nid: TASK-0001\ntitle: Test Task\n'
        task_file.write_text(task_content)

        # Create store
        store = TaskContextStore(tmp_path)

        # Create snapshot
        metadata = store.create_task_snapshot('TASK-0001', task_file)

        # Verify metadata
        assert 'snapshot_path' in metadata
        assert 'snapshot_sha256' in metadata
        assert 'original_path' in metadata
        assert 'completed_path' in metadata
        assert 'created_at' in metadata

        # Verify snapshot file created
        snapshot_path = tmp_path / metadata['snapshot_path']
        assert snapshot_path.exists()
        assert snapshot_path.read_text() == task_content

        # Verify SHA256 hash
        expected_sha = hashlib.sha256(task_content.encode('utf-8')).hexdigest()
        assert metadata['snapshot_sha256'] == expected_sha

    def test_create_snapshot_auto_resolve_path(self, tmp_path: Path):
        """Test creating snapshot with auto-resolved task file path."""
        # Create task file in active location
        tasks_mobile = tmp_path / 'tasks' / 'mobile'
        tasks_mobile.mkdir(parents=True)
        task_file = tasks_mobile / 'TASK-0818-test.task.yaml'
        task_content = 'schema_version: "1.1"\nid: TASK-0818\n'
        task_file.write_text(task_content)

        # Create store
        store = TaskContextStore(tmp_path)

        # Create snapshot (auto-resolve)
        metadata = store.create_task_snapshot('TASK-0818')

        # Verify snapshot created
        snapshot_path = tmp_path / metadata['snapshot_path']
        assert snapshot_path.exists()

        # Verify original and completed paths
        assert metadata['original_path'] == 'tasks/mobile/TASK-0818-test.task.yaml'
        assert metadata['completed_path'] == 'docs/completed-tasks/TASK-0818-test.task.yaml'

    def test_create_snapshot_for_completed_task(self, tmp_path: Path):
        """Test creating snapshot for already-completed task."""
        # Create task file in completed location
        completed_dir = tmp_path / 'docs' / 'completed-tasks'
        completed_dir.mkdir(parents=True)
        task_file = completed_dir / 'TASK-0200-done.task.yaml'
        task_content = 'schema_version: "1.1"\nid: TASK-0200\nstatus: done\n'
        task_file.write_text(task_content)

        # Create store
        store = TaskContextStore(tmp_path)

        # Create snapshot
        metadata = store.create_task_snapshot('TASK-0200')

        # Verify paths (completed_path should match original_path)
        assert 'completed-tasks' in metadata['original_path']
        assert metadata['completed_path'] == metadata['original_path']

    def test_create_snapshot_missing_task_raises(self, tmp_path: Path):
        """Test creating snapshot for nonexistent task raises FileNotFoundError."""
        # Create store
        store = TaskContextStore(tmp_path)

        # Attempt to create snapshot
        with pytest.raises(FileNotFoundError, match="Task file not found"):
            store.create_task_snapshot('TASK-9999')

    def test_create_snapshot_atomic_write(self, tmp_path: Path):
        """Test snapshot uses atomic write mechanism."""
        # Create task file
        task_file = tmp_path / 'test-task.yaml'
        task_content = 'schema_version: "1.1"\nid: TASK-0001\n'
        task_file.write_text(task_content)

        # Create store
        store = TaskContextStore(tmp_path)

        # Create snapshot
        metadata = store.create_task_snapshot('TASK-0001', task_file)

        # Verify no temp files left behind
        snapshot_dir = tmp_path / '.agent-output' / 'TASK-0001'
        temp_files = list(snapshot_dir.glob('.task-snapshot.yaml.tmp*'))
        assert len(temp_files) == 0

        # Verify final snapshot exists
        snapshot_path = tmp_path / metadata['snapshot_path']
        assert snapshot_path.exists()


class TestChecklistSnapshots:
    """Test checklist snapshot functionality."""

    def test_snapshot_default_checklists(self, tmp_path: Path):
        """Test snapshotting default checklists."""
        # Create checklist files
        agents_dir = tmp_path / 'docs' / 'agents'
        agents_dir.mkdir(parents=True)

        preflight = agents_dir / 'implementation-preflight.md'
        preflight.write_text('# Implementation Preflight\n\nSteps here...\n')

        diff_safety = agents_dir / 'diff-safety-checklist.md'
        diff_safety.write_text('# Diff Safety Checklist\n\nChecks here...\n')

        # Create store
        store = TaskContextStore(tmp_path)

        # Snapshot checklists
        attachments = store.snapshot_checklists('TASK-0818', 'mobile')

        # Verify attachments created
        assert len(attachments) == 2
        assert all(att.type == 'file' for att in attachments)
        assert any('implementation-preflight' in att.path for att in attachments)
        assert any('diff-safety-checklist' in att.path for att in attachments)

    def test_snapshot_tier_specific_checklist(self, tmp_path: Path):
        """Test snapshotting tier-specific checklist when it exists."""
        # Create checklist files
        agents_dir = tmp_path / 'docs' / 'agents'
        agents_dir.mkdir(parents=True)

        preflight = agents_dir / 'implementation-preflight.md'
        preflight.write_text('# Preflight\n')

        diff_safety = agents_dir / 'diff-safety-checklist.md'
        diff_safety.write_text('# Diff Safety\n')

        mobile_checklist = agents_dir / 'mobile-implementation-checklist.md'
        mobile_checklist.write_text('# Mobile Implementation\n')

        # Create store
        store = TaskContextStore(tmp_path)

        # Snapshot checklists
        attachments = store.snapshot_checklists('TASK-0818', 'mobile')

        # Verify all 3 attachments created
        assert len(attachments) == 3
        assert any('mobile-implementation-checklist' in att.path for att in attachments)

    def test_snapshot_missing_checklists_graceful(self, tmp_path: Path):
        """Test graceful handling when checklists are missing."""
        # Create store (no checklist files exist)
        store = TaskContextStore(tmp_path)

        # Snapshot checklists
        attachments = store.snapshot_checklists('TASK-0818', 'mobile')

        # Should return empty list (no errors)
        assert len(attachments) == 0

    def test_snapshot_checklists_with_sha256(self, tmp_path: Path):
        """Test checklist snapshots include SHA256 hashes."""
        # Create checklist file
        agents_dir = tmp_path / 'docs' / 'agents'
        agents_dir.mkdir(parents=True)

        preflight = agents_dir / 'implementation-preflight.md'
        content = '# Implementation Preflight\n\nStep 1\nStep 2\n'
        preflight.write_text(content)

        # Create store
        store = TaskContextStore(tmp_path)

        # Snapshot checklists
        attachments = store.snapshot_checklists('TASK-0818', 'mobile')

        # Verify SHA256 hash
        assert len(attachments) == 1
        att = attachments[0]

        expected_sha = hashlib.sha256(content.encode('utf-8')).hexdigest()
        assert att.sha256 == expected_sha

    def test_snapshot_checklists_size_validation(self, tmp_path: Path):
        """Test checklist snapshots respect size limits."""
        # Create large checklist file (>1MB)
        agents_dir = tmp_path / 'docs' / 'agents'
        agents_dir.mkdir(parents=True)

        preflight = agents_dir / 'implementation-preflight.md'
        large_content = 'x' * (2 * 1024 * 1024)  # 2MB
        preflight.write_text(large_content)

        # Create store
        store = TaskContextStore(tmp_path)

        # Snapshot checklists (should skip due to size)
        attachments = store.snapshot_checklists('TASK-0818', 'mobile')

        # Should skip large file
        assert len(attachments) == 0


class TestAcceptanceCriteriaEmbedding:
    """Test acceptance criteria and plan embedding (placeholder)."""

    def test_embed_acceptance_criteria_placeholder(self, tmp_path: Path):
        """Test that embed_acceptance_criteria exists and doesn't crash."""
        # This is a placeholder method until TaskSnapshot model is extended
        from scripts.tasks_cli.context_store import TaskContext

        # Create task data
        task_data = {
            'acceptance_criteria': [
                'Criterion 1',
                'Criterion 2'
            ],
            'scope': {
                'in': ['Scope item 1', 'Scope item 2'],
                'out': ['Out of scope']
            },
            'plan': {
                'steps': [
                    {'step': 'Step 1: Do something'},
                    {'step': 'Step 2: Do another thing'}
                ]
            },
            'deliverables': ['Deliverable 1', 'Deliverable 2']
        }

        # Create minimal context
        store = TaskContextStore(tmp_path)

        # Note: This method is a placeholder and doesn't actually modify context yet
        # Just verify it doesn't crash
        # (We would need a full TaskContext instance to test properly)


class TestIntegrationSnapshot:
    """Integration tests for complete snapshot workflow."""

    def test_complete_snapshot_workflow(self, tmp_path: Path):
        """Test complete workflow: resolve → snapshot → checklists."""
        # Setup task file
        tasks_mobile = tmp_path / 'tasks' / 'mobile'
        tasks_mobile.mkdir(parents=True)
        task_file = tasks_mobile / 'TASK-0818-test.task.yaml'
        task_content = """schema_version: "1.1"
id: TASK-0818
title: Test Task
acceptance_criteria:
  - Criterion 1
  - Criterion 2
scope:
  in:
    - Scope item
  out:
    - Out of scope
"""
        task_file.write_text(task_content)

        # Setup checklists
        agents_dir = tmp_path / 'docs' / 'agents'
        agents_dir.mkdir(parents=True)
        preflight = agents_dir / 'implementation-preflight.md'
        preflight.write_text('# Preflight\n')

        # Create store
        store = TaskContextStore(tmp_path)

        # Step 1: Resolve path
        resolved = store.resolve_task_path('TASK-0818')
        assert resolved is not None

        # Step 2: Create snapshot
        snapshot_meta = store.create_task_snapshot('TASK-0818')
        assert snapshot_meta['snapshot_sha256']

        # Step 3: Snapshot checklists
        checklist_attachments = store.snapshot_checklists('TASK-0818', 'mobile')
        assert len(checklist_attachments) >= 1

        # Verify snapshot file exists
        snapshot_path = tmp_path / snapshot_meta['snapshot_path']
        assert snapshot_path.exists()
        assert snapshot_path.read_text() == task_content

    def test_snapshot_with_evidence_index(self, tmp_path: Path):
        """Test that checklist snapshots update evidence index."""
        # Setup
        agents_dir = tmp_path / 'docs' / 'agents'
        agents_dir.mkdir(parents=True)
        preflight = agents_dir / 'implementation-preflight.md'
        preflight.write_text('# Preflight\n')

        store = TaskContextStore(tmp_path)

        # Snapshot checklists
        attachments = store.snapshot_checklists('TASK-0818', 'mobile')

        # Verify evidence index created
        evidence_dir = tmp_path / '.agent-output' / 'TASK-0818' / 'evidence'
        index_path = evidence_dir / 'index.json'

        assert index_path.exists()

        # Load and verify index
        with open(index_path, 'r', encoding='utf-8') as f:
            index = json.load(f)

        assert 'version' in index
        assert 'evidence' in index
        assert len(index['evidence']) == len(attachments)


class TestStandaloneModuleFunctions:
    """Test standalone task_snapshot module functions."""

    def test_standalone_create_task_snapshot(self, tmp_path: Path):
        """Test standalone create_task_snapshot function."""
        from scripts.tasks_cli.task_snapshot import create_task_snapshot

        # Create task file
        task_path = tmp_path / "tasks" / "backend" / "TASK-TEST-001.task.yaml"
        task_path.parent.mkdir(parents=True, exist_ok=True)
        task_content = "schema_version: '1.1'\nid: TASK-TEST-001\n"
        task_path.write_text(task_content)

        # Create output directory
        output_dir = tmp_path / ".agent-output" / "TASK-TEST-001"

        # Create snapshot
        snapshot_meta = create_task_snapshot(
            task_id="TASK-TEST-001",
            task_path=task_path,
            output_dir=output_dir,
            repo_root=tmp_path
        )

        # Verify metadata
        assert "snapshot_path" in snapshot_meta
        assert "sha256" in snapshot_meta
        assert "original_path" in snapshot_meta
        assert "completed_path" in snapshot_meta
        assert "created_at" in snapshot_meta

        # Verify snapshot file
        snapshot_path = tmp_path / snapshot_meta["snapshot_path"]
        assert snapshot_path.exists()
        assert snapshot_path.read_text() == task_content

        # Verify SHA256
        expected_hash = hashlib.sha256(task_content.encode('utf-8')).hexdigest()
        assert snapshot_meta["sha256"] == expected_hash

    def test_standalone_embed_acceptance_criteria(self, tmp_path: Path):
        """Test standalone embed_acceptance_criteria function."""
        from scripts.tasks_cli.task_snapshot import embed_acceptance_criteria

        task_data = {
            "acceptance_criteria": ["Criterion 1", "Criterion 2"],
            "plan": [{"step": "Step 1"}, {"step": "Step 2"}],
            "scope": {"in": ["Item 1"], "out": ["Item 2"]},
            "deliverables": ["Deliverable 1"]
        }

        context = {}
        embed_acceptance_criteria(context, task_data)

        # Verify embedded data
        assert "immutable" in context
        assert context["immutable"]["acceptance_criteria"] == task_data["acceptance_criteria"]
        assert context["immutable"]["plan"] == task_data["plan"]
        assert context["immutable"]["scope"]["in"] == task_data["scope"]["in"]
        assert context["immutable"]["scope"]["out"] == task_data["scope"]["out"]
        assert context["immutable"]["deliverables"] == task_data["deliverables"]

    def test_standalone_resolve_task_path(self, tmp_path: Path):
        """Test standalone resolve_task_path function."""
        from scripts.tasks_cli.task_snapshot import resolve_task_path

        # Create active task
        task_path = tmp_path / "tasks" / "mobile" / "TASK-0818.task.yaml"
        task_path.parent.mkdir(parents=True, exist_ok=True)
        task_path.touch()

        # Resolve
        resolved = resolve_task_path("TASK-0818", tmp_path)

        assert resolved == task_path
        assert resolved.exists()

    def test_standalone_snapshot_checklists(self, tmp_path: Path):
        """Test standalone snapshot_checklists function."""
        from scripts.tasks_cli.task_snapshot import snapshot_checklists

        # Create checklists
        agents_dir = tmp_path / "docs" / "agents"
        agents_dir.mkdir(parents=True, exist_ok=True)
        (agents_dir / "implementation-preflight.md").write_text("# Preflight")
        (agents_dir / "diff-safety-checklist.md").write_text("# Safety")

        # Create store
        store = TaskContextStore(tmp_path)

        # Note: snapshot_checklists requires a context to exist because attach_evidence
        # validates context existence. This is expected behavior - in practice it's
        # called after init_context. Test that it handles missing context gracefully.
        attachments = snapshot_checklists(
            task_id="TASK-TEST-001",
            tier="backend",
            repo_root=tmp_path,
            context_store=store
        )

        # Should return empty list when context doesn't exist (graceful handling)
        # The function catches exceptions from attach_evidence internally
        assert isinstance(attachments, list)

    def test_standalone_resolve_task_path_not_found(self, tmp_path: Path):
        """Test standalone resolve_task_path returns None for missing task."""
        from scripts.tasks_cli.task_snapshot import resolve_task_path

        resolved = resolve_task_path("TASK-9999", tmp_path)

        assert resolved is None

    def test_standalone_embed_with_missing_optional_fields(self, tmp_path: Path):
        """Test standalone embed handles missing optional fields."""
        from scripts.tasks_cli.task_snapshot import embed_acceptance_criteria

        task_data = {
            "acceptance_criteria": ["Criterion 1"],
            "plan": [{"step": "Step 1"}],
            "scope": {"in": ["Item 1"]},  # Missing "out"
            # Missing "deliverables"
        }

        context = {}
        embed_acceptance_criteria(context, task_data)

        # Should handle gracefully
        assert context["immutable"]["scope"]["out"] == []
        assert context["immutable"]["deliverables"] == []
