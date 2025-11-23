"""Legacy CLI command handler for context initialization."""

from pathlib import Path
from typing import Dict, Any
import sys
import json
from datetime import datetime, timezone
import yaml
import hashlib

from ..context_store import (
    TaskContextStore,
    SourceFile,
)
from ..exception_ledger import add_exception
from ..quarantine import is_quarantined
from ..task_snapshot import resolve_task_path
from ..providers import GitProvider
from ..output import (
    format_success_response,
    format_error_response
)
from .standards_helpers import (
    _extract_standards_citations,
    _build_standards_citations,
)

# Exit codes per schemas doc section 6.1
EXIT_SUCCESS = 0
EXIT_GENERAL_ERROR = 1
EXIT_VALIDATION_ERROR = 10
EXIT_BLOCKER_ERROR = 30
EXIT_IO_ERROR = 40
EXIT_GIT_ERROR = 50


def print_success(ctx: "TaskCliContext", data: Dict[str, Any]) -> None:
    """Print success response in JSON mode or text mode."""
    if ctx.output_channel.json_mode:
        response = format_success_response(data)
        ctx.output_channel.print_json(response)


def print_error(ctx: "TaskCliContext", error: Dict[str, Any], exit_code: int) -> None:
    """Print error response and exit."""
    if ctx.output_channel.json_mode:
        response = format_error_response(
            code=error["code"],
            message=error["message"],
            details=error.get("details"),
            name=error.get("name"),
            recovery_action=error.get("recovery_action")
        )
        ctx.output_channel.print_json(response)
    else:
        print(f"Error [{error['code']}]: {error['message']}", file=sys.stderr)
        if "recovery_action" in error:
            print(f"Recovery: {error['recovery_action']}", file=sys.stderr)
    sys.exit(exit_code)


def cmd_init_context(ctx: "TaskCliContext", args) -> int:
    """
    Enhanced context initialization with all validations.

    Args:
        ctx: TaskCliContext with output channel
        args: Parsed arguments

    Integrates:
    - Quarantine checks
    - Acceptance criteria validation
    - Task snapshot creation
    - Standards excerpt attachment
    - Checklist snapshots
    - Exception ledger checks
    """
    try:
        repo_root = Path.cwd()
        context_store = TaskContextStore(repo_root)

        if is_quarantined(args.task_id, repo_root):
            error = {
                "code": "E030",
                "name": "TaskQuarantined",
                "message": f"Task {args.task_id} is quarantined",
                "details": {"task_id": args.task_id},
                "recovery_action": "Release from quarantine or fix issues first"
            }
            print_error(ctx, error, exit_code=EXIT_BLOCKER_ERROR)

        task_path = resolve_task_path(args.task_id, repo_root)
        if not task_path:
            error = {
                "code": "E041",
                "name": "TaskNotFound",
                "message": f"Task file not found for {args.task_id}",
                "details": {"task_id": args.task_id},
                "recovery_action": "Verify task ID and check tasks/ directory"
            }
            print_error(ctx, error, exit_code=EXIT_IO_ERROR)
        assert task_path is not None

        with open(task_path, 'r', encoding='utf-8') as f:
            task_data = yaml.safe_load(f)

        scope = task_data.get('scope', {})
        scope_in = scope.get('in', []) if isinstance(scope, dict) else []
        scope_out = scope.get('out', []) if isinstance(scope, dict) else []
        acceptance_criteria = task_data.get('acceptance_criteria', [])
        plan_steps = task_data.get('plan', [])
        deliverables = task_data.get('deliverables', [])
        validation = task_data.get('validation', {})
        validation_pipeline = validation.get('pipeline', validation.get('commands', [])) if isinstance(validation, dict) else []

        validation_errors = []
        if not acceptance_criteria:
            validation_errors.append("acceptance_criteria is empty")
        if not scope_in:
            validation_errors.append("scope.in is empty")
        if not scope_out:
            validation_errors.append("scope.out is empty")
        if not plan_steps:
            validation_errors.append("plan is empty")
        if not deliverables:
            validation_errors.append("deliverables is empty")
        if not validation_pipeline:
            validation_errors.append("validation.pipeline is empty")

        if validation_errors:
            error = {
                "code": "E001",
                "name": "IncompleteTaskSchema",
                "message": "Required task fields are empty",
                "details": {"task_id": args.task_id, "missing_fields": validation_errors},
                "recovery_action": "Populate all required fields: scope.in, scope.out, acceptance_criteria, plan, deliverables, validation.pipeline"
            }
            add_exception(
                task_id=args.task_id,
                exception_type="invalid_schema",
                parse_error="; ".join(validation_errors)
            )
            print_error(ctx, error, exit_code=EXIT_VALIDATION_ERROR)

        allow_dirty = hasattr(args, 'allow_preexisting_dirty') and args.allow_preexisting_dirty
        if not allow_dirty:
            git_provider = GitProvider(repo_root)
            is_clean, dirty_files = git_provider.check_dirty_tree(
                allow_preexisting=False,
                expected_files=[f".agent-output/{args.task_id}/"]
            )
            if not is_clean:
                error = {
                    "code": "E050",
                    "name": "DirtyWorkingTree",
                    "message": "Git working tree has unexpected dirty files",
                    "details": {"files": dirty_files[:10]},
                    "recovery_action": "Commit or stash changes, or use --allow-preexisting-dirty"
                }
                print_error(ctx, error, exit_code=EXIT_GIT_ERROR)

        task_snapshot = {
            'title': task_data.get('title', ''),
            'priority': task_data.get('priority', 'P1'),
            'area': task_data.get('area', ''),
            'description': task_data.get('description', ''),
            'scope_in': scope_in,
            'scope_out': scope_out,
            'acceptance_criteria': acceptance_criteria,
            'plan_steps': plan_steps,
            'deliverables': deliverables
        }

        context_data = task_data.get('context', {})
        repo_paths = context_data.get('repo_paths', []) if isinstance(context_data, dict) else []

        qa_commands = []
        validation_commands = []
        for idx, cmd in enumerate(validation_pipeline):
            if isinstance(cmd, str):
                qa_commands.append(cmd)
                validation_commands.append({
                    'id': f'val-{idx+1:03d}',
                    'command': cmd,
                    'description': f'Validation command {idx+1}',
                    'cwd': '.',
                    'package': None,
                    'env': {},
                    'expected_paths': [],
                    'blocker_id': None,
                    'timeout_ms': 120000,
                    'retry_policy': {'max_attempts': 1, 'backoff_ms': 1000},
                    'criticality': 'required',
                    'expected_exit_codes': [0]
                })
            elif isinstance(cmd, dict):
                command = cmd.get('command', cmd.get('cmd', ''))
                if command:
                    qa_commands.append(command)
                    retry_policy = cmd.get('retry_policy', {})
                    if isinstance(retry_policy, dict):
                        retry_policy = {
                            'max_attempts': retry_policy.get('max_attempts', 1),
                            'backoff_ms': retry_policy.get('backoff_ms', 1000)
                        }
                    else:
                        retry_policy = {'max_attempts': 1, 'backoff_ms': 1000}

                    validation_commands.append({
                        'id': cmd.get('id', f'val-{idx+1:03d}'),
                        'command': command,
                        'description': cmd.get('description', ''),
                        'cwd': cmd.get('cwd', '.'),
                        'package': cmd.get('package'),
                        'env': cmd.get('env', {}),
                        'expected_paths': cmd.get('expected_paths', []),
                        'blocker_id': cmd.get('blocker_id'),
                        'timeout_ms': cmd.get('timeout_ms', 120000),
                        'retry_policy': retry_policy,
                        'criticality': cmd.get('criticality', 'required'),
                        'expected_exit_codes': cmd.get('expected_exit_codes', [0])
                    })

        task_snapshot['validation_commands'] = validation_commands

        validation_baseline = {
            'commands': qa_commands,
            'initial_results': None
        }

        area = task_snapshot['area']
        priority = task_snapshot['priority']
        task_id = args.task_id
        standards_citations = _extract_standards_citations(
            context_store=context_store,
            task_id=task_id,
            area=area,
            priority=priority,
            task_data=task_data
        )

        immutable = {
            'task_snapshot': task_snapshot,
            'standards_citations': standards_citations,
            'validation_baseline': validation_baseline,
            'repo_paths': repo_paths
        }

        task_content = task_path.read_bytes()
        task_file_sha = hashlib.sha256(task_content).hexdigest()

        git_provider = GitProvider(repo_root)
        try:
            base_commit = git_provider.get_current_commit()
        except Exception:
            base_commit = None
        if not base_commit:
            error = {
                "code": "E051",
                "name": "GitHeadNotFound",
                "message": "Unable to determine git HEAD",
                "details": {},
                "recovery_action": "Ensure working directory is in a git repository"
            }
            print_error(ctx, error, exit_code=EXIT_GIT_ERROR)

        source_files = [
            SourceFile(
                path=str(task_path.relative_to(repo_root)),
                sha256=task_file_sha,
                purpose='task_yaml'
            )
        ]

        standards_files_seen = set()
        for citation_dict in standards_citations:
            standards_file_path = citation_dict.get('file')
            if standards_file_path and standards_file_path not in standards_files_seen:
                standards_files_seen.add(standards_file_path)
                full_path = repo_root / standards_file_path
                if full_path.exists():
                    standards_content = full_path.read_bytes()
                    standards_sha = hashlib.sha256(standards_content).hexdigest()
                    source_files.append(
                        SourceFile(
                            path=standards_file_path,
                            sha256=standards_sha,
                            purpose='standards_citation'
                        )
                    )

        snapshot_metadata = context_store.create_task_snapshot(args.task_id, task_path)

        task_snapshot['snapshot_path'] = snapshot_metadata['snapshot_path']
        task_snapshot['snapshot_sha256'] = snapshot_metadata['snapshot_sha256']
        task_snapshot['original_path'] = snapshot_metadata['original_path']
        task_snapshot['completed_path'] = snapshot_metadata['completed_path']
        task_snapshot['created_at'] = snapshot_metadata['created_at']

        context = context_store.init_context(
            task_id=args.task_id,
            immutable=immutable,
            git_head=base_commit,
            task_file_sha=task_file_sha,
            created_by=getattr(args, 'actor', 'task-runner'),
            force_secrets=getattr(args, 'force_secrets', False),
            source_files=source_files
        )

        snapshot_file_path = repo_root / snapshot_metadata['snapshot_path']
        context_store.attach_evidence(
            task_id=args.task_id,
            artifact_type='file',
            artifact_path=snapshot_file_path,
            description='Task snapshot at initialization',
            metadata={
                'snapshot_sha256': snapshot_metadata['snapshot_sha256'],
                'original_path': snapshot_metadata['original_path']
            }
        )

        if ctx.output_channel.json_mode:
            print_success(ctx, {
                "task_id": args.task_id,
                "context_initialized": True,
                "base_commit": base_commit,
                "context_version": context.version,
                "acceptance_criteria_count": len(acceptance_criteria)
            })
        else:
            print(f"✓ Context initialized for {args.task_id}")
            print(f"  Base commit: {base_commit[:8]}")
            print(f"  Context file: .agent-output/{args.task_id}/context.json")
            print(f"  Acceptance criteria: {len(acceptance_criteria)} items")

        return EXIT_SUCCESS

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(ctx, error, exit_code=EXIT_GENERAL_ERROR)
