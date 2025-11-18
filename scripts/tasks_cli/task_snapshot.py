"""Task snapshot system for capturing and embedding task data."""

from pathlib import Path
from typing import Dict, Any, Optional, List
import hashlib
import shutil
from datetime import datetime


def create_task_snapshot(
    task_id: str,
    task_path: Path,
    output_dir: Path,
    repo_root: Path
) -> Dict[str, Any]:
    """
    Create a snapshot of the task file.

    Args:
        task_id: Task ID (e.g., "TASK-0818")
        task_path: Path to current .task.yaml file
        output_dir: .agent-output/TASK-XXXX directory
        repo_root: Repository root path

    Returns:
        Snapshot metadata dict with:
        - snapshot_path: Path to snapshot file
        - sha256: Hash of snapshot content
        - original_path: Original task file path (relative to repo)
        - completed_path: Future path in docs/completed-tasks/
        - created_at: ISO 8601 timestamp
    """
    # Read original task file
    with open(task_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Compute SHA256
    sha256_hash = hashlib.sha256(content.encode('utf-8')).hexdigest()

    # Create snapshot file path
    snapshot_path = output_dir / "task-snapshot.yaml"
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)

    # Copy file to snapshot location
    shutil.copy2(task_path, snapshot_path)

    # Determine paths (relative to repo root)
    original_rel = task_path.relative_to(repo_root)
    completed_rel = Path("docs/completed-tasks") / task_path.name

    return {
        "snapshot_path": str(snapshot_path.relative_to(repo_root)),
        "sha256": sha256_hash,
        "original_path": str(original_rel),
        "completed_path": str(completed_rel),
        "created_at": datetime.utcnow().isoformat() + "Z"
    }


def embed_acceptance_criteria(
    context: Dict[str, Any],
    task_data: Dict[str, Any]
) -> None:
    """
    Embed acceptance criteria into context immutable section.

    Modifies context in-place to add:
    - acceptance_criteria: list of criteria strings
    - plan: list of plan step dicts
    - scope.in: list of in-scope items
    - scope.out: list of out-of-scope items (if present)

    Args:
        context: TaskContextStore dict (modified in-place)
        task_data: Parsed task YAML data
    """
    if "immutable" not in context:
        context["immutable"] = {}

    immutable = context["immutable"]

    # Embed acceptance criteria (required)
    immutable["acceptance_criteria"] = task_data.get("acceptance_criteria", [])

    # Embed plan steps (required)
    immutable["plan"] = task_data.get("plan", [])

    # Embed scope (in is required, out is optional)
    scope = task_data.get("scope", {})
    immutable["scope"] = {
        "in": scope.get("in", []),
        "out": scope.get("out", [])
    }

    # Embed deliverables (required)
    immutable["deliverables"] = task_data.get("deliverables", [])


def snapshot_checklists(
    task_id: str,
    tier: str,
    repo_root: Path,
    context_store: Any  # TaskContextStore instance
) -> List[Dict[str, Any]]:
    """
    Snapshot agent checklists as evidence attachments.

    Args:
        task_id: Task ID
        tier: Tier name (e.g., "backend", "mobile", "shared")
        repo_root: Repository root
        context_store: TaskContextStore instance

    Returns:
        List of evidence attachment dicts for checklists
    """
    checklist_dir = repo_root / "docs" / "agents"

    # Default checklists to snapshot
    checklist_files = [
        "implementation-preflight.md",
        "diff-safety-checklist.md"
    ]

    attachments = []

    for checklist_file in checklist_files:
        checklist_path = checklist_dir / checklist_file

        if not checklist_path.exists():
            continue

        try:
            # Attach as evidence
            evidence = context_store.attach_evidence(
                task_id=task_id,
                artifact_type="file",
                artifact_path=checklist_path,
                description=f"Agent checklist: {checklist_file}",
                metadata=None
            )

            attachments.append(evidence.to_dict())
        except Exception:
            # Skip if context doesn't exist or other error
            # In practice, this function is called after init_context
            continue

    return attachments


def resolve_task_path(task_id: str, repo_root: Path) -> Optional[Path]:
    """
    Resolve task file path, handling moved files.

    Checks in order:
    1. tasks/{tier}/{task_id}.task.yaml (all tiers)
    2. docs/completed-tasks/{task_id}.task.yaml

    Args:
        task_id: Task ID (e.g., "TASK-0818")
        repo_root: Repository root path

    Returns:
        Path to task file if found, None otherwise
    """
    # Check active task locations
    tasks_dir = repo_root / "tasks"

    if tasks_dir.exists():
        for tier_dir in tasks_dir.iterdir():
            if not tier_dir.is_dir():
                continue

            task_path = tier_dir / f"{task_id}.task.yaml"
            if task_path.exists():
                return task_path

    # Check completed tasks
    completed_path = repo_root / "docs" / "completed-tasks" / f"{task_id}.task.yaml"
    if completed_path.exists():
        return completed_path

    return None
