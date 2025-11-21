"""CLI command handlers for task context cache operations."""

from pathlib import Path
from typing import Dict, Any
import sys
import json
from datetime import datetime, timezone
import yaml
import hashlib

from .context_store import (
    TaskContextStore,
    SourceFile,
    DriftError,
    ContextNotFoundError,
    QACommandResult,
    QAResults
)
from .exception_ledger import (
    add_exception,
    list_exceptions,
    resolve_exception,
    cleanup_exception
)
from .quarantine import (
    quarantine_task,
    list_quarantined,
    release_from_quarantine,
    is_quarantined
)
from .task_snapshot import (
    resolve_task_path
)
from .validation import (
    execute_validation_command
)
from .qa_parsing import parse_qa_log
from .metrics import (
    collect_task_metrics,
    generate_metrics_dashboard,
    compare_metrics
)
from .git_utils import check_dirty_tree, get_current_commit
from .output import (
    print_json,
    is_json_mode,
    format_success_response,
    format_error_response
)


def _infer_command_type(command: str) -> str:
    """
    Infer QA command type from command string.

    Maps common command patterns to standard types: lint, typecheck, test, coverage.
    Falls back to 'unknown' if no pattern matches.

    Args:
        command: Shell command string

    Returns:
        One of: 'lint', 'typecheck', 'test', 'coverage', 'unknown'
    """
    command_lower = command.lower()

    # Lint patterns
    if any(pattern in command_lower for pattern in ['lint', 'eslint', 'ruff', 'flake8', 'pylint']):
        return 'lint'

    # Typecheck patterns
    if any(pattern in command_lower for pattern in ['typecheck', 'tsc', 'pyright', 'mypy']):
        return 'typecheck'

    # Coverage patterns (check before test since coverage commands often contain 'test')
    if any(pattern in command_lower for pattern in ['coverage', 'cov']):
        return 'coverage'

    # Test patterns
    if any(pattern in command_lower for pattern in ['test', 'jest', 'pytest', 'vitest']):
        return 'test'

    return 'unknown'


# Exit codes per schemas doc section 6.1
EXIT_SUCCESS = 0
EXIT_GENERAL_ERROR = 1
EXIT_VALIDATION_ERROR = 10
EXIT_DRIFT_ERROR = 20
EXIT_BLOCKER_ERROR = 30
EXIT_IO_ERROR = 40
EXIT_GIT_ERROR = 50


def print_success(data: Dict[str, Any]) -> None:
    """Print success response in JSON mode or text mode."""
    if is_json_mode():
        response = format_success_response(data)
        print_json(response)
    # In text mode, caller handles output


def print_error(error: Dict[str, Any], exit_code: int) -> None:
    """Print error response and exit."""
    if is_json_mode():
        response = format_error_response(
            code=error["code"],
            message=error["message"],
            details=error.get("details"),
            name=error.get("name"),
            recovery_action=error.get("recovery_action")
        )
        print_json(response)
    else:
        print(f"Error [{error['code']}]: {error['message']}", file=sys.stderr)
        if "recovery_action" in error:
            print(f"Recovery: {error['recovery_action']}", file=sys.stderr)
    sys.exit(exit_code)


def _extract_standards_citations(
    context_store: 'TaskContextStore',
    task_id: str,
    area: str,
    priority: str,
    task_data: dict
) -> list:
    """
    Extract standards citations with actual content from referenced files.

    Per proposal Section 3.1 and schemas Section 7.

    Args:
        context_store: TaskContextStore instance for extraction
        task_id: Task identifier
        area: Task area (backend, mobile, shared, infrastructure)
        priority: Task priority (P0, P1, P2)
        task_data: Full task YAML data

    Returns:
        List of standards citation dicts with line_span and content_sha
    """
    citations = []

    # Define section mappings: file -> list of section headings to extract
    section_map = {
        'standards/global.md': ['Release Governance', 'Governance & Evidence'],
        'standards/AGENTS.md': ['Agent Responsibilities'],
        'standards/backend-tier.md': ['Edge & Interface Layer', 'Lambda Application Layer'],
        'standards/frontend-tier.md': ['Component Structure', 'State Management'],
        'standards/shared-contracts-tier.md': ['Contract-First Design', 'Versioning'],
        'standards/typescript.md': ['Strict Configuration', 'Type Safety'],
        'standards/cross-cutting.md': ['Hard-Fail Controls', 'Maintainability & Change Impact'],
        'standards/testing-standards.md': ['Testing Requirements', 'Coverage Thresholds'],
    }

    # Collect standards files to extract from
    files_to_extract = set()

    # Add area-specific standards
    if area == 'backend':
        files_to_extract.update([
            'standards/backend-tier.md',
            'standards/cross-cutting.md',
            'standards/typescript.md',
        ])
    elif area == 'mobile':
        files_to_extract.update([
            'standards/frontend-tier.md',
            'standards/typescript.md',
        ])
    elif area == 'shared':
        files_to_extract.update([
            'standards/shared-contracts-tier.md',
            'standards/typescript.md',
        ])
    elif area in ('infrastructure', 'infra'):
        files_to_extract.add('standards/infrastructure-tier.md')

    # Always include global and testing standards
    files_to_extract.update([
        'standards/global.md',
        'standards/AGENTS.md',
        'standards/testing-standards.md',
    ])

    # Add task-specific overrides from context.related_docs
    context = task_data.get('context', {})
    if isinstance(context, dict):
        related_docs = context.get('related_docs', [])
        if isinstance(related_docs, list):
            for doc in related_docs:
                doc_str = str(doc)
                if doc_str.startswith('standards/'):
                    files_to_extract.add(doc_str)

    # Extract sections from each file
    for standards_file in sorted(files_to_extract):
        sections = section_map.get(standards_file, [])
        if not sections:
            # For files without predefined sections, try to extract first major section
            # by reading the file and finding the first ## heading
            try:
                file_path = context_store.repo_root / standards_file
                if file_path.exists():
                    content = file_path.read_text(encoding='utf-8')
                    lines = content.split('\n')
                    for line in lines:
                        if line.startswith('## '):
                            first_section = line[3:].strip()
                            sections = [first_section]
                            break
            except Exception:
                pass  # Skip if we can't read the file

        # Extract each section
        for section_heading in sections:
            try:
                excerpt = context_store.extract_standards_excerpt(
                    task_id=task_id,
                    standards_file=standards_file,
                    section_heading=section_heading
                )
                citations.append(excerpt.to_dict())
            except (FileNotFoundError, ValueError) as e:
                # Section not found or file missing - skip silently
                # This is expected for optional sections
                pass

    return citations


def _build_standards_citations(area: str, priority: str, task_data: dict) -> list:
    """
    Build standards citations based on task area and priority.

    Per proposal Section 5.1.1 (Standards Citation Algorithm).

    Args:
        area: Task area (backend, mobile, shared, infrastructure)
        priority: Task priority (P0, P1, P2)
        task_data: Full task YAML data

    Returns:
        List of standards citation dicts

    TODO: Implement line_span and content_sha extraction (M2)
          - Extract section boundaries from standards/*.md files using regex
          - Calculate SHA256 of section content for staleness detection
          - See proposal Section 5.1.1 for detailed algorithm
    """
    citations = []

    # Global standards for all tasks
    citations.extend([
        {
            'file': 'standards/global.md',
            'section': 'evidence-requirements',
            'requirement': 'Mandatory artifacts per release: evidence bundles, test results, compliance proofs',
            'line_span': None,
            'content_sha': None,
        },
        {
            'file': 'standards/AGENTS.md',
            'section': 'agent-coordination',
            'requirement': 'Agent handoff protocols and context management',
            'line_span': None,
            'content_sha': None,
        },
    ])

    # Area-specific citations
    if area == 'backend':
        citations.extend([
            {
                'file': 'standards/backend-tier.md',
                'section': 'handler-constraints',
                'requirement': 'Handler complexity must not exceed cyclomatic complexity 10; handlers limited to 75 LOC',
                'line_span': None,
                'content_sha': None,
            },
            {
                'file': 'standards/backend-tier.md',
                'section': 'layering-rules',
                'requirement': 'Handlers → Services → Providers (one-way only); no circular dependencies',
                'line_span': None,
                'content_sha': None,
            },
            {
                'file': 'standards/cross-cutting.md',
                'section': 'hard-fail-controls',
                'requirement': 'Handlers cannot import AWS SDKs; zero cycles; complexity budgets enforced',
                'line_span': None,
                'content_sha': None,
            },
        ])
    elif area == 'mobile':
        citations.extend([
            {
                'file': 'standards/frontend-tier.md',
                'section': 'component-standards',
                'requirement': 'Component complexity and state management patterns',
                'line_span': None,
                'content_sha': None,
            },
            {
                'file': 'standards/frontend-tier.md',
                'section': 'state-management',
                'requirement': 'Redux Toolkit patterns and async handling',
                'line_span': None,
                'content_sha': None,
            },
        ])
    elif area == 'shared':
        citations.extend([
            {
                'file': 'standards/shared-contracts-tier.md',
                'section': 'contract-first',
                'requirement': 'Zod schemas at boundaries; contract-first API design',
                'line_span': None,
                'content_sha': None,
            },
            {
                'file': 'standards/shared-contracts-tier.md',
                'section': 'versioning',
                'requirement': 'Breaking changes require /v{n} versioning',
                'line_span': None,
                'content_sha': None,
            },
        ])
    elif area in ('infrastructure', 'infra'):
        citations.extend([
            {
                'file': 'standards/infrastructure-tier.md',
                'section': 'terraform-modules',
                'requirement': 'Terraform module structure and local dev platform',
                'line_span': None,
                'content_sha': None,
            },
        ])

    # TypeScript standards for code areas
    if area in ('backend', 'mobile', 'shared'):
        citations.append({
            'file': 'standards/typescript.md',
            'section': 'strict-config',
            'requirement': 'Strict tsconfig including exactOptionalPropertyTypes; Zod at boundaries; neverthrow Results',
            'line_span': None,
            'content_sha': None,
        })

    # Testing standards
    citations.append({
        'file': 'standards/testing-standards.md',
        'section': f'{area}-qa-commands',
        'requirement': f'QA commands and coverage thresholds for {area}',
        'line_span': None,
        'content_sha': None,
    })

    # Task-specific overrides from context.related_docs
    context = task_data.get('context', {})
    if isinstance(context, dict):
        related_docs = context.get('related_docs', [])
        if isinstance(related_docs, list):
            for doc in related_docs:
                doc_str = str(doc)
                if doc_str.startswith('standards/') and not any(c['file'] == doc_str for c in citations):
                    citations.append({
                        'file': doc_str,
                        'section': 'task-specific',
                        'requirement': 'Referenced in task context',
                        'line_span': None,
                        'content_sha': None,
                    })

    return citations


def cmd_attach_evidence(args) -> int:
    """
    Attach evidence to task context.

    Args:
        args: Parsed arguments with task_id, type, path, description, metadata

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()
        context_store = TaskContextStore(repo_root)

        # Parse metadata if provided
        metadata = None
        if hasattr(args, 'metadata') and args.metadata:
            try:
                metadata = json.loads(args.metadata)
            except json.JSONDecodeError as e:
                error = {
                    "code": "E040",
                    "name": "InvalidMetadata",
                    "message": "Failed to parse metadata JSON",
                    "details": {"error": str(e)},
                    "recovery_action": "Provide valid JSON for --metadata"
                }
                print_error(error, exit_code=EXIT_VALIDATION_ERROR)

        # Attach evidence
        evidence = context_store.attach_evidence(
            task_id=args.task_id,
            artifact_type=args.type,
            artifact_path=Path(args.path),
            description=args.description,
            metadata=metadata
        )

        if is_json_mode():
            print_success(evidence.to_dict())
        else:
            print(f"✓ Evidence attached: {evidence.id}")
            print(f"  Type: {evidence.type}")
            print(f"  Path: {evidence.path}")

        return EXIT_SUCCESS

    except FileNotFoundError as e:
        error = {
            "code": "E041",
            "name": "FileNotFound",
            "message": str(e),
            "details": {"path": args.path},
            "recovery_action": "Verify file path exists"
        }
        print_error(error, exit_code=EXIT_IO_ERROR)

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_list_evidence(args) -> int:
    """
    List evidence attachments for a task.

    Args:
        args: Parsed arguments with task_id

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()
        context_store = TaskContextStore(repo_root)

        evidence_list = context_store.list_evidence(task_id=args.task_id)

        if is_json_mode():
            print_success({"evidence": [e.to_dict() for e in evidence_list], "count": len(evidence_list)})
        else:
            if not evidence_list:
                print("No evidence attachments found")
            else:
                print(f"Evidence attachments for {args.task_id}:")
                for ev in evidence_list:
                    print(f"  - {ev.id}: {ev.type} - {ev.description}")

        return EXIT_SUCCESS

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_attach_standard(args) -> int:
    """
    Attach standards excerpt to task context.

    Args:
        args: Parsed arguments with task_id, file, section

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()
        context_store = TaskContextStore(repo_root)

        # Extract and cache excerpt
        excerpt = context_store.extract_standards_excerpt(
            task_id=args.task_id,
            standards_file=args.file,
            section_heading=args.section
        )

        if is_json_mode():
            print_success(excerpt.to_dict())
        else:
            print(f"✓ Standards excerpt attached: {excerpt.excerpt_id}")
            print(f"  File: {excerpt.file}")
            print(f"  Section: {excerpt.section}")
            print(f"  Lines: {excerpt.line_span}")

        return EXIT_SUCCESS

    except FileNotFoundError:
        error = {
            "code": "E041",
            "name": "FileNotFound",
            "message": f"Standards file not found: {args.file}",
            "details": {"file": args.file},
            "recovery_action": "Verify standards file path"
        }
        print_error(error, exit_code=EXIT_IO_ERROR)

    except ValueError:
        error = {
            "code": "E010",
            "name": "SectionNotFound",
            "message": f"Section not found: {args.section}",
            "details": {"section": args.section},
            "recovery_action": "Check section heading exists in standards file"
        }
        print_error(error, exit_code=EXIT_VALIDATION_ERROR)

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_add_exception(args) -> int:
    """
    Add exception to ledger.

    Args:
        args: Parsed arguments with task_id, exception_type, message, owner

    Returns:
        Exit code
    """
    try:
        add_exception(
            task_id=args.task_id,
            exception_type=args.exception_type,
            parse_error=args.message
        )

        if is_json_mode():
            print_success({"task_id": args.task_id, "exception_type": args.exception_type})
        else:
            print(f"✓ Exception added for {args.task_id}")
            print(f"  Type: {args.exception_type}")

        return EXIT_SUCCESS

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_list_exceptions(args) -> int:
    """
    List exceptions from ledger.

    Args:
        args: Parsed arguments with optional status filter

    Returns:
        Exit code
    """
    try:
        status_filter = args.status if hasattr(args, 'status') and args.status else None
        exceptions = list_exceptions(status_filter=status_filter)

        # Convert to dicts for JSON serialization
        exception_dicts = [exc.to_dict() for exc in exceptions]

        if is_json_mode():
            print_success({"exceptions": exception_dicts, "count": len(exception_dicts)})
        else:
            if not exception_dicts:
                print("No exceptions found")
            else:
                print(f"Exceptions ({len(exception_dicts)}):")
                for exc in exception_dicts:
                    status_icon = "🔴" if exc['remediation']['status'] == 'open' else "✅"
                    print(f"  {status_icon} {exc['task_id']}: {exc['exception_type']}")
                    if exc.get('parse_error'):
                        print(f"     Error: {exc['parse_error'][:80]}...")

        return EXIT_SUCCESS

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_resolve_exception(args) -> int:
    """
    Resolve exception in ledger.

    Args:
        args: Parsed arguments with task_id, notes

    Returns:
        Exit code
    """
    try:
        notes = args.notes if hasattr(args, 'notes') and args.notes else "Resolved"
        resolve_exception(task_id=args.task_id, notes=notes)

        if is_json_mode():
            print_success({"task_id": args.task_id, "status": "resolved"})
        else:
            print(f"✓ Exception resolved for {args.task_id}")

        return EXIT_SUCCESS

    except ValueError as e:
        error = {
            "code": "E010",
            "name": "NotFound",
            "message": str(e),
            "details": {"task_id": args.task_id},
            "recovery_action": "Verify task_id exists in exception ledger"
        }
        print_error(error, exit_code=EXIT_VALIDATION_ERROR)

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_cleanup_exceptions(args) -> int:
    """
    Cleanup exceptions based on trigger.

    Args:
        args: Parsed arguments with task_id, trigger

    Returns:
        Exit code
    """
    try:
        trigger = args.trigger if hasattr(args, 'trigger') and args.trigger else "manual"
        cleanup_exception(task_id=args.task_id, trigger=trigger)

        if is_json_mode():
            print_success({"task_id": args.task_id, "trigger": trigger})
        else:
            print(f"✓ Exception cleanup for {args.task_id} (trigger: {trigger})")

        return EXIT_SUCCESS

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_list_quarantined(args) -> int:
    """
    List quarantined tasks.

    Args:
        args: Parsed arguments with optional status filter

    Returns:
        Exit code
    """
    try:
        status_filter = args.status if hasattr(args, 'status') and args.status else None
        quarantined = list_quarantined(status_filter=status_filter)

        if is_json_mode():
            # Convert to dict for JSON serialization
            quarantined_dicts = [q.to_dict() for q in quarantined]
            print_success({"quarantined": quarantined_dicts, "count": len(quarantined_dicts)})
        else:
            if not quarantined:
                print("No quarantined tasks")
            else:
                print(f"Quarantined tasks ({len(quarantined)}):")
                for q in quarantined:
                    print(f"  🚫 {q.task_id}: {q.reason}")
                    print(f"     Quarantined: {q.quarantined_at}")

        return EXIT_SUCCESS

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_release_quarantine(args) -> int:
    """
    Release task from quarantine.

    Args:
        args: Parsed arguments with task_id

    Returns:
        Exit code
    """
    try:
        release_from_quarantine(task_id=args.task_id)

        if is_json_mode():
            print_success({"task_id": args.task_id, "status": "released"})
        else:
            print(f"✓ Released {args.task_id} from quarantine")

        return EXIT_SUCCESS

    except FileNotFoundError as e:
        error = {
            "code": "E041",
            "name": "NotFound",
            "message": str(e),
            "details": {"task_id": args.task_id},
            "recovery_action": "Verify task is currently quarantined"
        }
        print_error(error, exit_code=EXIT_IO_ERROR)

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_quarantine_task(args) -> int:
    """
    Quarantine a task.

    Args:
        args: Parsed arguments with task_id, reason, error_details

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()
        error_details = args.error_details if hasattr(args, 'error_details') and args.error_details else None

        entry_path = quarantine_task(
            task_id=args.task_id,
            reason=args.reason,
            error_details=error_details,
            repo_root=repo_root
        )

        if is_json_mode():
            print_success({"task_id": args.task_id, "reason": args.reason, "path": str(entry_path)})
        else:
            print(f"✓ Task {args.task_id} quarantined")
            print(f"  Reason: {args.reason}")
            print(f"  Entry: {entry_path}")

        return EXIT_SUCCESS

    except ValueError as e:
        error = {
            "code": "E010",
            "name": "ValidationError",
            "message": str(e),
            "details": {},
            "recovery_action": "Verify task_id and reason format"
        }
        print_error(error, exit_code=EXIT_VALIDATION_ERROR)

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_init_context(args) -> int:
    """
    Enhanced context initialization with all validations.

    Integrates:
    - Quarantine checks
    - Acceptance criteria validation
    - Task snapshot creation
    - Standards excerpt attachment
    - Checklist snapshots
    - Exception ledger checks

    Args:
        args: Parsed arguments with task_id, allow_preexisting_dirty

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()

        # Initialize context store early (needed by _extract_standards_citations)
        context_store = TaskContextStore(repo_root)

        # Check if task is quarantined
        if is_quarantined(args.task_id, repo_root):
            error = {
                "code": "E030",
                "name": "TaskQuarantined",
                "message": f"Task {args.task_id} is quarantined",
                "details": {"task_id": args.task_id},
                "recovery_action": "Release from quarantine or fix issues first"
            }
            print_error(error, exit_code=EXIT_BLOCKER_ERROR)

        # Resolve task file path
        task_path = resolve_task_path(args.task_id, repo_root)
        if not task_path:
            error = {
                "code": "E041",
                "name": "TaskNotFound",
                "message": f"Task file not found for {args.task_id}",
                "details": {"task_id": args.task_id},
                "recovery_action": "Verify task ID and check tasks/ directory"
            }
            print_error(error, exit_code=EXIT_IO_ERROR)
        assert task_path is not None  # For mypy: print_error never returns

        # Load task data
        with open(task_path, 'r', encoding='utf-8') as f:
            task_data = yaml.safe_load(f)

        # Validate required non-empty fields per schema
        scope = task_data.get('scope', {})
        scope_in = scope.get('in', []) if isinstance(scope, dict) else []
        scope_out = scope.get('out', []) if isinstance(scope, dict) else []
        acceptance_criteria = task_data.get('acceptance_criteria', [])
        plan_steps = task_data.get('plan', [])
        deliverables = task_data.get('deliverables', [])
        validation = task_data.get('validation', {})
        validation_pipeline = validation.get('pipeline', validation.get('commands', [])) if isinstance(validation, dict) else []

        # Check all required fields
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

            # Add to exception ledger
            # Note: "invalid_schema" is the correct enum value per models.py EXCEPTION_TYPES
            add_exception(
                task_id=args.task_id,
                exception_type="invalid_schema",
                parse_error="; ".join(validation_errors)
            )

            print_error(error, exit_code=EXIT_VALIDATION_ERROR)

        # Check dirty tree
        allow_dirty = hasattr(args, 'allow_preexisting_dirty') and args.allow_preexisting_dirty
        if not allow_dirty:
            is_clean, dirty_files = check_dirty_tree(
                repo_root,
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
                print_error(error, exit_code=EXIT_GIT_ERROR)

        # Build immutable context payload
        # (Fields already extracted during validation above)

        # Build task snapshot
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

        # Extract repo paths
        context_data = task_data.get('context', {})
        repo_paths = context_data.get('repo_paths', []) if isinstance(context_data, dict) else []

        # Extract validation commands (support both 'command' and legacy 'cmd' keys)
        # (validation_pipeline already extracted during field validation above)
        qa_commands = []
        validation_commands = []  # Structured command objects
        for idx, cmd in enumerate(validation_pipeline):
            if isinstance(cmd, str):
                qa_commands.append(cmd)
                # Create full ValidationCommand structure with defaults
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
                # Support both 'command' and legacy 'cmd' keys
                command = cmd.get('command', cmd.get('cmd', ''))
                if command:
                    qa_commands.append(command)
                    # Preserve full command structure per schema §2.1
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

        # Update task snapshot with validation_commands
        task_snapshot['validation_commands'] = validation_commands

        validation_baseline = {
            'commands': qa_commands,
            'initial_results': None
        }

        # Extract standards citations with actual content
        area = task_snapshot['area']
        priority = task_snapshot['priority']
        standards_citations = _extract_standards_citations(
            context_store=context_store,
            task_id=task_id,
            area=area,
            priority=priority,
            task_data=task_data
        )

        # Build immutable payload
        immutable = {
            'task_snapshot': task_snapshot,
            'standards_citations': standards_citations,
            'validation_baseline': validation_baseline,
            'repo_paths': repo_paths
        }

        # Calculate task file SHA256
        task_content = task_path.read_bytes()
        task_file_sha = hashlib.sha256(task_content).hexdigest()

        # Get current git commit
        base_commit = get_current_commit(repo_root)
        if not base_commit:
            error = {
                "code": "E051",
                "name": "GitHeadNotFound",
                "message": "Unable to determine git HEAD",
                "details": {},
                "recovery_action": "Ensure working directory is in a git repository"
            }
            print_error(error, exit_code=EXIT_GIT_ERROR)

        # Build source files list
        source_files = [
            SourceFile(
                path=str(task_path.relative_to(repo_root)),
                sha256=task_file_sha,
                purpose='task_yaml'
            )
        ]

        # Add standards files used in citations (per §3.3 manifest requirement)
        # Collect unique standards file paths from citations
        standards_files_seen = set()
        for citation_dict in standards_citations:
            standards_file_path = citation_dict.get('file')
            if standards_file_path and standards_file_path not in standards_files_seen:
                standards_files_seen.add(standards_file_path)
                full_path = repo_root / standards_file_path
                if full_path.exists():
                    # Calculate SHA256 of standards file
                    standards_content = full_path.read_bytes()
                    standards_sha = hashlib.sha256(standards_content).hexdigest()
                    source_files.append(
                        SourceFile(
                            path=standards_file_path,
                            sha256=standards_sha,
                            purpose='standards_citation'
                        )
                    )

        # Create task snapshot (per Section 3.1 requirement)
        snapshot_metadata = context_store.create_task_snapshot(args.task_id, task_path)

        # Add snapshot metadata to task_snapshot
        # Note: Use 'created_at' to match TaskSnapshot.from_dict() field name
        task_snapshot['snapshot_path'] = snapshot_metadata['snapshot_path']
        task_snapshot['snapshot_sha256'] = snapshot_metadata['snapshot_sha256']
        task_snapshot['original_path'] = snapshot_metadata['original_path']
        task_snapshot['completed_path'] = snapshot_metadata['completed_path']
        task_snapshot['created_at'] = snapshot_metadata['created_at']

        # Create context
        context = context_store.init_context(
            task_id=args.task_id,
            immutable=immutable,
            git_head=base_commit,
            task_file_sha=task_file_sha,
            created_by=getattr(args, 'actor', 'task-runner'),
            force_secrets=getattr(args, 'force_secrets', False),
            source_files=source_files
        )

        # Attach task snapshot as evidence (per Section 3.1 requirement)
        snapshot_file_path = repo_root / snapshot_metadata['snapshot_path']
        context_store.attach_evidence(
            task_id=args.task_id,
            artifact_type='file',
            artifact_path=snapshot_file_path,
            description=f'Task snapshot at initialization',
            metadata={
                'snapshot_sha256': snapshot_metadata['snapshot_sha256'],
                'original_path': snapshot_metadata['original_path']
            }
        )

        if is_json_mode():
            print_success({
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
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_record_qa(args) -> int:
    """
    Record QA command results in context.validation_baseline.initial_results.

    Args:
        args: Parsed arguments with task_id, command, exit_code, log_path

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()
        context_store = TaskContextStore(repo_root)

        # Parse log path - handle both relative and absolute paths
        log_path = Path(args.log_path)

        # Get current git commit SHA
        git_sha = get_current_commit(repo_root)

        # Parse QA log
        qa_summary = None
        log_sha256 = None
        if log_path.exists():
            # Determine command type: use explicit flag or infer from command
            command_type = getattr(args, 'command_type', None) or _infer_command_type(args.command)
            qa_summary = parse_qa_log(log_path, command_type)
            # Calculate log file SHA256
            log_sha256 = hashlib.sha256(log_path.read_bytes()).hexdigest()

        # Get command ID - prefer explicit arg, otherwise lookup from context
        # Per §4.1: command_id must match validation command ID from task file
        command_id = getattr(args, 'command_id', None)
        if not command_id:
            # Try to lookup command ID from context validation_commands
            context = context_store.get_context(args.task_id)
            if context and context.immutable.task_snapshot.validation_commands:
                # Match by command string
                matching_cmd = next(
                    (cmd for cmd in context.immutable.task_snapshot.validation_commands
                     if cmd.get('command') == args.command),
                    None
                )
                if matching_cmd:
                    command_id = matching_cmd.get('id')

        # Fallback: generate from command SHA if no ID found
        if not command_id:
            command_id = hashlib.sha256(args.command.encode('utf-8')).hexdigest()[:8]

        # Get duration if provided, otherwise default to 0
        duration_ms = getattr(args, 'duration_ms', 0)

        # Attach log as evidence first to get the evidence bundle path
        evidence_log_path = None
        if log_path.exists():
            evidence_attachment = context_store.attach_evidence(
                task_id=args.task_id,
                artifact_type="qa_output",
                artifact_path=log_path,
                description=f"QA output: {args.command}",
                metadata={
                    "command": args.command,
                    "exit_code": args.exit_code,
                    "duration_ms": duration_ms
                }
            )
            # Use the evidence bundle path instead of the transient source path
            evidence_log_path = evidence_attachment.path

        # Create QA command result with evidence bundle path
        qa_command_result = QACommandResult(
            command_id=command_id,
            command=args.command,
            exit_code=args.exit_code,
            duration_ms=duration_ms,
            log_path=evidence_log_path,
            log_sha256=log_sha256,
            summary=qa_summary
        )

        # Load context and update validation_baseline with new QA result
        context = context_store.get_context(args.task_id)
        if context is None:
            error = {
                "code": "E020",
                "name": "ContextNotFoundError",
                "message": f"Context not found for {args.task_id}",
                "details": {"task_id": args.task_id},
                "recovery_action": "Run --init-context first to create context"
            }
            print_error(error, exit_code=EXIT_DRIFT_ERROR)
        assert context is not None  # For mypy: print_error never returns

        # Get existing QA results or create new
        existing_qa_results = context.validation_baseline.get_qa_results()
        if existing_qa_results is not None:
            # Append to existing results
            results_list = list(existing_qa_results.results)
            results_list.append(qa_command_result)
            new_qa_results = QAResults(
                recorded_at=existing_qa_results.recorded_at,
                agent=existing_qa_results.agent,
                git_sha=git_sha or existing_qa_results.git_sha,
                results=results_list
            )
        else:
            # Create new QA results
            new_qa_results = QAResults(
                recorded_at=datetime.now(timezone.utc).isoformat(),
                agent=getattr(args, 'actor', 'qa-recorder'),
                git_sha=git_sha,
                results=[qa_command_result]
            )

        # Create new ValidationBaseline with updated QA results (immutable pattern)
        context.validation_baseline = context.validation_baseline.with_qa_results(new_qa_results)

        # Update audit trail and save context
        from filelock import FileLock
        context_file = context_store._get_context_file(args.task_id)

        with FileLock(str(context_store.lock_file), timeout=10):
            context.audit_updated_at = datetime.now(timezone.utc).isoformat()
            context.audit_updated_by = getattr(args, 'actor', 'qa-recorder')
            context.audit_update_count += 1

            # Write atomically
            json_content = json.dumps(context.to_dict(), indent=2, sort_keys=True, ensure_ascii=False)
            json_content += '\n'
            context_store._atomic_write(context_file, json_content)

        if is_json_mode():
            print_success(qa_command_result.to_dict())
        else:
            print(f"✓ QA result recorded for {args.command}")
            print(f"  Exit code: {args.exit_code}")
            print(f"  Log: {relative_log_path}")
            print("  Stored in context.validation_baseline.initial_results")

        return EXIT_SUCCESS

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_run_validation(args) -> int:
    """
    Run validation command with all features.

    Args:
        args: Parsed arguments with task_id, command_id, command, and other options

    Returns:
        Exit code matching validation result
    """
    try:
        repo_root = Path.cwd()
        # Note: TaskContextStore not yet needed for validation command execution
        # context_store = TaskContextStore(repo_root)

        # Import models
        from .models import ValidationCommand, RetryPolicy

        # Parse env vars
        env_dict = {}
        if hasattr(args, 'env_vars') and args.env_vars:
            for env_str in args.env_vars:
                key, value = env_str.split('=', 1)
                env_dict[key] = value

        # Create validation command object
        validation_cmd = ValidationCommand(
            id=args.command_id,
            command=args.command if hasattr(args, 'command') else "echo 'placeholder'",
            description=args.description if hasattr(args, 'description') else "Validation command",
            cwd=args.cwd if hasattr(args, 'cwd') else str(repo_root),
            package=args.package if hasattr(args, 'package') else None,
            env=env_dict,
            expected_paths=args.expected_paths if hasattr(args, 'expected_paths') else [],
            blocker_id=args.blocker_id if hasattr(args, 'blocker_id') else None,
            timeout_ms=args.timeout_ms if hasattr(args, 'timeout_ms') else 120000,
            retry_policy=RetryPolicy(max_attempts=1, backoff_ms=0),
            criticality=args.criticality if hasattr(args, 'criticality') else "error",
            expected_exit_codes=args.expected_exit_codes if hasattr(args, 'expected_exit_codes') else [0]
        )

        # Execute validation command
        result = execute_validation_command(validation_cmd, args.task_id, repo_root)

        if is_json_mode():
            print_success(result)
        else:
            if result.get("skipped"):
                print(f"⊘ Validation skipped: {result['skip_reason']}")
            elif result.get("success"):
                print(f"✓ Validation passed: {args.command_id}")
            else:
                print(f"✗ Validation failed: {args.command_id}")
                print(f"  Exit code: {result.get('exit_code')}")

        # Return exit code based on result
        if result.get("skipped"):
            return EXIT_BLOCKER_ERROR
        elif result.get("success"):
            return EXIT_SUCCESS
        else:
            return EXIT_VALIDATION_ERROR

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_verify_worktree(args) -> int:
    """
    Verify working tree matches expected state from previous agent.

    Uses SHA256 verification via TaskContextStore.verify_worktree_state() to detect
    drift, tampered files, and mismatched diffs.

    Args:
        args: Parsed arguments with task_id, expected_agent

    Returns:
        Exit code (DRIFT_ERROR if drift detected)
    """
    try:
        repo_root = Path.cwd()

        # Validate required arguments
        if not hasattr(args, 'expected_agent') or not args.expected_agent:
            error = {
                "code": "E011",
                "name": "MissingRequiredArgument",
                "message": "--expected-agent is required for verify-worktree",
                "details": {},
                "recovery_action": "Specify which agent's snapshot to verify against (implementer, reviewer, validator)"
            }
            print_error(error, exit_code=EXIT_VALIDATION_ERROR)

        # Initialize context store and call verify_worktree_state
        context_store = TaskContextStore(repo_root)

        try:
            # This will raise DriftError if drift detected, ContextNotFoundError if no snapshot
            context_store.verify_worktree_state(
                task_id=args.task_id,
                expected_agent=args.expected_agent
            )

            # No drift detected
            if is_json_mode():
                print_success({
                    "task_id": args.task_id,
                    "expected_agent": args.expected_agent,
                    "drift_detected": False
                })
            else:
                print(f"✓ Working tree verified against {args.expected_agent} snapshot for {args.task_id}")
                print("  No drift detected")

            return EXIT_SUCCESS

        except DriftError as e:
            # Drift detected - return detailed error
            if is_json_mode():
                print_json({
                    "success": False,
                    "drift_detected": True,
                    "task_id": args.task_id,
                    "expected_agent": args.expected_agent,
                    "error": str(e)
                })
            else:
                print(f"⚠ Drift detected for {args.task_id} ({args.expected_agent} snapshot):", file=sys.stderr)
                print(f"  {e}", file=sys.stderr)

            return EXIT_DRIFT_ERROR

        except ContextNotFoundError as e:
            error = {
                "code": "E020",
                "name": "ContextNotFoundError",
                "message": str(e),
                "details": {"task_id": args.task_id, "expected_agent": args.expected_agent},
                "recovery_action": "Ensure context exists and agent has created a snapshot"
            }
            print_error(error, exit_code=EXIT_DRIFT_ERROR)

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_collect_metrics(args) -> int:
    """
    Collect metrics for a task.

    Args:
        args: Parsed arguments with task_id, baseline_path (optional)

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()

        # Load baseline if provided
        baseline = None
        if hasattr(args, 'baseline_path') and args.baseline_path:
            with open(args.baseline_path) as f:
                baseline = json.load(f)

        # Collect metrics
        metrics = collect_task_metrics(args.task_id, repo_root, baseline)

        # Transform to schema format per §10.1 of task-context-cache-hardening-schemas.md
        metrics_output = {
            "task_id": args.task_id,
            "completed_at": metrics.timestamp,
            "metrics": {
                "file_read_reduction": {
                    "implementer_reads": metrics.file_reads_by_agent.get("implementer", 0),
                    "reviewer_reads": metrics.file_reads_by_agent.get("reviewer", 0),
                    "validator_reads": metrics.file_reads_by_agent.get("validator", 0),
                    "target_met": metrics.success_criteria_met.get("file_reads", False)
                },
                "warning_noise": {
                    "total_warnings": metrics.total_warnings,
                    "unique_warnings": metrics.total_warnings - metrics.repeated_warnings,
                    "repeated_warnings": metrics.repeated_warnings,
                    "target_met": metrics.success_criteria_met.get("warnings", False)
                },
                "qa_artifact_availability": {
                    "required_commands": metrics.qa_commands_run,
                    "commands_with_logs": metrics.qa_commands_with_logs,
                    "coverage_percent": metrics.qa_artifact_coverage,
                    "target_met": metrics.success_criteria_met.get("qa_coverage", False)
                },
                "prompt_size_savings": {
                    "baseline_kb": (metrics.baseline_prompt_tokens / 1024) if metrics.baseline_prompt_tokens else None,
                    "current_kb": (metrics.current_prompt_tokens / 1024) if metrics.current_prompt_tokens else None,
                    "reduction_percent": metrics.prompt_size_savings_pct,
                    "target_met": metrics.success_criteria_met.get("prompt_savings", False)
                },
                "json_output_reliability": {
                    "total_json_calls": metrics.json_calls,
                    "parse_failures": metrics.json_parse_failures,
                    "target_met": metrics.success_criteria_met.get("json_reliability", False)
                }
            }
        }

        # Add baseline if provided
        if baseline:
            metrics_output["baseline"] = baseline

        # Save metrics to schema-compliant filename
        output_path = repo_root / ".agent-output" / args.task_id / "metrics-summary.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w') as f:
            json.dump(metrics_output, f, indent=2)

        if is_json_mode():
            print_success(metrics_output)
        else:
            print(f"✓ Metrics collected for {args.task_id}")
            print(f"  Agents: {len(metrics.agents_run)}")
            print(f"  Avg file reads: {metrics.avg_file_reads_per_agent:.1f}")
            print(f"  QA coverage: {metrics.qa_artifact_coverage:.1f}%")
            print(f"  Saved to: {output_path}")

        return EXIT_SUCCESS

    except FileNotFoundError as e:
        error = {
            "code": "E041",
            "name": "FileNotFound",
            "message": str(e),
            "details": {},
            "recovery_action": "Ensure task has telemetry data"
        }
        print_error(error, exit_code=EXIT_IO_ERROR)

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_generate_dashboard(args) -> int:
    """
    Generate metrics dashboard across tasks.

    Args:
        args: Parsed arguments with task_ids (list), output_path

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()
        output_path = Path(args.output_path)

        # Generate dashboard
        dashboard = generate_metrics_dashboard(args.task_ids, repo_root, output_path)

        if is_json_mode():
            from dataclasses import asdict
            print_success(asdict(dashboard))
        else:
            print(f"✓ Dashboard generated for {dashboard.total_tasks} tasks")
            print(f"  All criteria met: {dashboard.all_criteria_met}")
            print(f"  Saved to: {output_path}")

        return EXIT_SUCCESS

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_compare_metrics(args) -> int:
    """
    Compare baseline and current metrics.

    Args:
        args: Parsed arguments with baseline_path, current_path

    Returns:
        Exit code
    """
    try:
        comparison = compare_metrics(Path(args.baseline_path), Path(args.current_path))

        if is_json_mode():
            print_success(comparison)
        else:
            print("Metrics Comparison:")
            for metric, delta in comparison["deltas"].items():
                improvement = "✓" if delta["improvement"] else "✗"
                print(f"  {improvement} {metric}: {delta['baseline']:.1f} → {delta['current']:.1f} (Δ {delta['delta']:+.1f})")

        return EXIT_SUCCESS

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)
