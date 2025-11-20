"""
Dual-dispatch command router for Tasks CLI.

Routes commands to either legacy argparse handlers or Typer-based handlers
based on dispatch_registry.yaml configuration.

Environment Variable:
    TASKS_CLI_LEGACY_DISPATCH: Set to '1' to force all commands through legacy
                               handlers (emergency rollback mechanism)
"""

import importlib.util
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

import yaml


def load_registry() -> Dict[str, Dict[str, Any]]:
    """
    Load dispatch registry from YAML configuration.

    Returns:
        Dictionary mapping command names to handler metadata

    Raises:
        FileNotFoundError: If dispatch_registry.yaml is not found
        yaml.YAMLError: If registry YAML is malformed
    """
    registry_path = Path(__file__).parent / "dispatch_registry.yaml"

    if not registry_path.exists():
        raise FileNotFoundError(f"Dispatch registry not found: {registry_path}")

    with open(registry_path, 'r', encoding='utf-8') as f:
        try:
            data = yaml.safe_load(f)
        except yaml.YAMLError as e:
            raise yaml.YAMLError(f"Failed to parse dispatch registry: {e}") from e

    if not isinstance(data, dict) or 'commands' not in data:
        raise ValueError("Invalid registry structure: missing 'commands' key")

    return data['commands']


def should_use_legacy(command: str, registry: Optional[Dict[str, Dict[str, Any]]] = None) -> bool:
    """
    Determine if a command should use legacy handler.

    Checks:
    1. TASKS_CLI_LEGACY_DISPATCH env var (if '1', always use legacy)
    2. Registry handler field (if 'legacy', use legacy)

    Args:
        command: Command name (e.g., 'list', 'validate', 'pick')
        registry: Optional pre-loaded registry (avoids re-parsing YAML)

    Returns:
        True if command should use legacy handler, False for Typer
    """
    # Emergency override: force all commands to legacy
    if os.environ.get('TASKS_CLI_LEGACY_DISPATCH') == '1':
        return True

    # Load registry if not provided
    if registry is None:
        try:
            registry = load_registry()
        except (FileNotFoundError, yaml.YAMLError, ValueError):
            # Fail-safe: if registry cannot be loaded, default to legacy
            print(
                f"Warning: Could not load dispatch registry, defaulting to legacy for '{command}'",
                file=sys.stderr
            )
            return True

    # Check command in registry
    command_config = registry.get(command, {})
    handler_type = command_config.get('handler', 'legacy')

    return handler_type == 'legacy'


def dispatch_command(
    command: str,
    args: Any,
    context: Optional[Dict[str, Any]] = None
) -> int:
    """
    Dispatch command to appropriate handler (legacy or Typer).

    Args:
        command: Command name to dispatch
        args: Parsed argparse Namespace from main CLI
        context: Optional context dict with datastore, picker, graph, etc.

    Returns:
        Exit code from handler execution

    Raises:
        NotImplementedError: If Typer handler requested but not yet implemented
    """
    registry = load_registry()

    if should_use_legacy(command, registry):
        # Route to legacy handler in __main__.py
        return _dispatch_legacy(command, args, context)
    else:
        # Route to Typer handler (to be implemented in Wave 1)
        return _dispatch_typer(command, args, context)


def _dispatch_legacy(
    command: str,
    args: Any,
    context: Optional[Dict[str, Any]] = None
) -> int:
    """
    Dispatch to legacy argparse handler in __main__.py.

    Args:
        command: Command name
        args: Argparse namespace
        context: Optional context with datastore, picker, graph

    Returns:
        Exit code from legacy handler

    Note:
        This function assumes the caller (main()) has already routed to the
        appropriate cmd_* function. This is a placeholder for when dispatcher
        becomes the primary entry point.
    """
    # For now, this is a pass-through since __main__.py handles routing
    # In future waves, this will call cmd_* functions directly
    try:
        from . import __main__ as main_module
    except ImportError:
        # Handle case where module is run directly (e.g., in tests)
        import importlib.util
        main_path = Path(__file__).parent / "__main__.py"
        spec = importlib.util.spec_from_file_location("__main__", main_path)
        if spec and spec.loader:
            main_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(main_module)
        else:
            print(f"Error: Could not load __main__ module", file=sys.stderr)
            return 1

    # Map command names to main module function names
    command_map = {
        'list': 'cmd_list',
        'validate': 'cmd_validate',
        'explain': 'cmd_explain',
        'pick': 'cmd_pick',
        'claim': 'cmd_claim',
        'complete': 'cmd_complete',
        'archive': 'cmd_archive',
        'graph': 'cmd_graph',
        'refresh-cache': 'cmd_refresh_cache',
        'check-halt': 'cmd_check_halt',
        'lint': 'cmd_lint',
        'bootstrap-evidence': 'cmd_bootstrap_evidence',
        'init-context': 'cmd_init_context',
        'get-context': 'cmd_get_context',
        'update-agent': 'cmd_update_agent',
        'mark-blocked': 'cmd_mark_blocked',
        'purge-context': 'cmd_purge_context',
        'rebuild-context': 'cmd_rebuild_context',
        'snapshot-worktree': 'cmd_snapshot_worktree',
        'verify-worktree': 'cmd_verify_worktree',
        'get-diff': 'cmd_get_diff',
        'record-qa': 'cmd_record_qa',
        'compare-qa': 'cmd_compare_qa',
        'resolve-drift': 'cmd_resolve_drift',
        'attach-evidence': 'cmd_attach_evidence',
        'list-evidence': 'cmd_list_evidence',
        'attach-standard': 'cmd_attach_standard',
        'add-exception': 'cmd_add_exception',
        'list-exceptions': 'cmd_list_exceptions',
        'resolve-exception': 'cmd_resolve_exception',
        'cleanup-exceptions': 'cmd_cleanup_exceptions',
        'quarantine-task': 'cmd_quarantine_task',
        'list-quarantined': 'cmd_list_quarantined',
        'release-quarantine': 'cmd_release_quarantine',
        'run-validation': 'cmd_run_validation',
        'collect-metrics': 'cmd_collect_metrics',
        'generate-dashboard': 'cmd_generate_dashboard',
        'compare-metrics': 'cmd_compare_metrics',
    }

    handler_name = command_map.get(command)
    if not handler_name:
        print(f"Error: Unknown command '{command}'", file=sys.stderr)
        return 1

    # Get handler function from main module
    if hasattr(main_module, handler_name):
        handler_fn = getattr(main_module, handler_name)
        # Call handler with args and optional context
        if context:
            # Some handlers need picker, graph, datastore
            if command in ('list', 'pick'):
                return handler_fn(args, context.get('picker'))
            elif command == 'validate':
                return handler_fn(args, context.get('graph'))
            elif command == 'explain':
                return handler_fn(args, context.get('graph'), context.get('datastore'))
            else:
                # Context-cache and other commands don't need picker/graph
                return handler_fn(args, context.get('repo_root'))
        else:
            # Commands imported from commands.py (no context needed)
            return handler_fn(args)
    else:
        print(f"Error: Handler '{handler_name}' not found in __main__", file=sys.stderr)
        return 1


def _dispatch_typer(
    command: str,
    args: Any,
    context: Optional[Dict[str, Any]] = None
) -> int:
    """
    Dispatch to Typer-based handler.

    Args:
        command: Command name
        args: Argparse namespace (will be converted to Typer context)
        context: Optional context with datastore, picker, graph

    Returns:
        Exit code from Typer handler

    Raises:
        NotImplementedError: Typer handlers not yet implemented (Wave 1)
    """
    raise NotImplementedError(
        f"Typer handler for '{command}' not yet implemented. "
        f"Set TASKS_CLI_LEGACY_DISPATCH=1 to use legacy handler."
    )


def validate_registry() -> bool:
    """
    Validate dispatch registry for common errors.

    Checks:
    - Registry can be loaded and parsed
    - All commands have required fields
    - No duplicate command entries
    - Handler values are valid ('legacy' or 'typer')

    Returns:
        True if registry is valid, False otherwise
    """
    try:
        registry = load_registry()
    except (FileNotFoundError, yaml.YAMLError, ValueError) as e:
        print(f"Registry validation failed: {e}", file=sys.stderr)
        return False

    errors = []
    seen_commands = set()

    for command, config in registry.items():
        # Check for duplicates
        if command in seen_commands:
            errors.append(f"Duplicate command entry: {command}")
        seen_commands.add(command)

        # Check required fields
        if 'handler' not in config:
            errors.append(f"Command '{command}' missing 'handler' field")
            continue

        # Validate handler value
        handler = config['handler']
        if handler not in ('legacy', 'typer'):
            errors.append(f"Command '{command}' has invalid handler: '{handler}'")

        # Check migrated field
        if 'migrated' not in config:
            errors.append(f"Command '{command}' missing 'migrated' field")

    if errors:
        print("Registry validation errors:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return False

    return True
