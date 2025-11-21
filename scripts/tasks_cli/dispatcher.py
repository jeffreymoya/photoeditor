"""
Typer command router for Tasks CLI.

Routes commands to Typer-based handlers via dispatch_registry.yaml configuration.

Note: Legacy dispatch support removed in S9.2 (2025-11-21).
All commands now use Typer handlers exclusively.
"""

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
    Check if a command should use legacy handler.

    Since S9.2 (2025-11-21), all commands use Typer handlers.
    This function always returns False for backward compatibility.

    Args:
        command: Command name (e.g., 'list', 'validate', 'pick')
        registry: Optional pre-loaded registry (ignored)

    Returns:
        Always False - legacy handlers removed
    """
    # All commands now use Typer handlers
    return False


def dispatch_command(
    command: str,
    args: Any,
    context: Optional[Dict[str, Any]] = None
) -> int:
    """
    Dispatch command to Typer handler.

    Args:
        command: Command name to dispatch
        args: Parsed argparse Namespace from main CLI
        context: Optional context dict with repo_root

    Returns:
        Exit code from handler execution
    """
    return _dispatch_typer(command, args, context)


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
        context: Optional context with repo_root

    Returns:
        Exit code from Typer handler
    """
    from .app import app, initialize_commands

    # Get repo_root from context
    repo_root = context.get('repo_root') if context else None
    if not repo_root:
        print("Error: repo_root not found in context", file=sys.stderr)
        return 1

    # Initialize Typer commands with context
    json_mode = getattr(args, 'format', 'text') == 'json'
    initialize_commands(repo_root, json_mode=json_mode)

    # Build Typer command-line arguments
    typer_args = [command]

    # Map argparse args to Typer args based on command
    if command == 'list':
        if hasattr(args, 'filter') and args.filter:
            typer_args.append(args.filter)
        if hasattr(args, 'format') and args.format:
            typer_args.extend(['--format', args.format])
    elif command == 'validate':
        if hasattr(args, 'format') and args.format:
            typer_args.extend(['--format', args.format])
    elif command == 'show':
        if hasattr(args, 'task_id') and args.task_id:
            typer_args.append(args.task_id)
        if hasattr(args, 'format') and args.format:
            typer_args.extend(['--format', args.format])

    # Invoke Typer app
    try:
        app(typer_args, standalone_mode=False)
        return 0
    except SystemExit as e:
        return e.code if e.code is not None else 0
    except Exception as e:
        print(f"Error executing Typer command: {e}", file=sys.stderr)
        return 1


def validate_registry() -> bool:
    """
    Validate dispatch registry for common errors.

    Checks:
    - Registry can be loaded and parsed
    - All commands have required fields
    - No duplicate command entries
    - Handler values are 'typer'

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

        # Validate handler value (only 'typer' allowed now)
        handler = config['handler']
        if handler != 'typer':
            errors.append(f"Command '{command}' has invalid handler: '{handler}' (only 'typer' supported)")

        # Check migrated field
        if 'migrated' not in config:
            errors.append(f"Command '{command}' missing 'migrated' field")

    if errors:
        print("Registry validation errors:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return False

    return True
