"""
Tests for Typer command router.

Validates:
- Registry loading and parsing
- Command routing logic
- Registry validation

Note: Legacy dispatch tests removed in S9.2 (2025-11-21).
All commands now use Typer handlers exclusively.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, mock_open
import pytest
import yaml

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dispatcher import (
    load_registry,
    should_use_legacy,
    dispatch_command,
    validate_registry,
    _dispatch_typer,
)


class TestLoadRegistry:
    """Test registry loading and parsing."""

    def test_load_registry_success(self):
        """Registry loads and parses correctly."""
        registry = load_registry()

        assert isinstance(registry, dict)
        assert 'list' in registry
        assert 'validate' in registry
        assert 'explain' in registry

        # Check structure of a command entry
        list_config = registry['list']
        assert 'handler' in list_config
        assert 'migrated' in list_config
        assert 'description' in list_config

    def test_load_registry_file_not_found(self):
        """Raises FileNotFoundError if registry missing."""
        with patch('dispatcher.Path') as mock_path:
            mock_registry_path = MagicMock()
            mock_registry_path.exists.return_value = False
            mock_path.return_value.parent.__truediv__.return_value = mock_registry_path

            with pytest.raises(FileNotFoundError, match="Dispatch registry not found"):
                load_registry()

    def test_load_registry_malformed_yaml(self):
        """Raises YAMLError if registry YAML is malformed."""
        mock_yaml_content = "commands:\n  list:\n    handler: typer\n  - invalid yaml syntax"

        with patch('builtins.open', mock_open(read_data=mock_yaml_content)):
            with patch('dispatcher.Path') as mock_path:
                mock_registry_path = MagicMock()
                mock_registry_path.exists.return_value = True
                mock_path.return_value.parent.__truediv__.return_value = mock_registry_path

                with pytest.raises(yaml.YAMLError):
                    load_registry()

    def test_load_registry_missing_commands_key(self):
        """Raises ValueError if 'commands' key missing."""
        mock_yaml_content = "invalid_key:\n  list:\n    handler: typer"

        with patch('builtins.open', mock_open(read_data=mock_yaml_content)):
            with patch('dispatcher.Path') as mock_path:
                mock_registry_path = MagicMock()
                mock_registry_path.exists.return_value = True
                mock_path.return_value.parent.__truediv__.return_value = mock_registry_path

                with pytest.raises(ValueError, match="missing 'commands' key"):
                    load_registry()


class TestShouldUseLegacy:
    """Test legacy dispatch decision logic.

    Note: Since S9.2, should_use_legacy always returns False
    as all commands use Typer handlers.
    """

    def test_always_returns_false(self):
        """should_use_legacy always returns False."""
        mock_registry = {
            'list': {'handler': 'typer', 'migrated': True}
        }

        assert should_use_legacy('list', registry=mock_registry) is False

    def test_returns_false_even_for_unknown_command(self):
        """Returns False even for unknown commands."""
        mock_registry = {
            'list': {'handler': 'typer', 'migrated': True}
        }

        # 'unknown-command' not in registry
        result = should_use_legacy('unknown-command', registry=mock_registry)

        assert result is False


class TestDispatchCommand:
    """Test command dispatching to Typer handlers."""

    def test_dispatch_to_typer_handler(self):
        """Command dispatches to Typer handler."""
        mock_args = MagicMock()
        mock_context = {'repo_root': Path('/test')}

        with patch('dispatcher._dispatch_typer', return_value=0) as mock_typer:
            exit_code = dispatch_command('list', mock_args, mock_context)

            mock_typer.assert_called_once_with('list', mock_args, mock_context)
            assert exit_code == 0


class TestDispatchTyper:
    """Test Typer handler routing.

    Note: Direct unit testing of _dispatch_typer is limited because it uses
    relative imports that require package context. Full integration testing
    is performed via the CLI entry points in test_cli_smoke.py.
    """

    @pytest.mark.skip(reason="Requires package context for relative imports - tested via integration tests")
    def test_dispatch_typer_requires_repo_root(self, capsys):
        """Typer dispatch returns error when repo_root missing from context."""
        pass


class TestValidateRegistry:
    """Test registry validation logic."""

    def test_validate_registry_success(self):
        """Valid registry passes all checks."""
        result = validate_registry()

        assert result is True

    def test_validate_registry_missing_handler_field(self, capsys):
        """Detects missing 'handler' field."""
        mock_registry = {
            'list': {'migrated': False, 'description': 'List tasks'},
            'validate': {'handler': 'typer', 'migrated': True}
        }

        with patch('dispatcher.load_registry', return_value=mock_registry):
            result = validate_registry()

            assert result is False
            captured = capsys.readouterr()
            assert "missing 'handler' field" in captured.err

    def test_validate_registry_invalid_handler_value(self, capsys):
        """Detects invalid handler values (only 'typer' allowed)."""
        mock_registry = {
            'list': {'handler': 'legacy', 'migrated': False}
        }

        with patch('dispatcher.load_registry', return_value=mock_registry):
            result = validate_registry()

            assert result is False
            captured = capsys.readouterr()
            assert "invalid handler" in captured.err
            assert "only 'typer' supported" in captured.err

    def test_validate_registry_missing_migrated_field(self, capsys):
        """Detects missing 'migrated' field."""
        mock_registry = {
            'list': {'handler': 'typer'}
        }

        with patch('dispatcher.load_registry', return_value=mock_registry):
            result = validate_registry()

            assert result is False
            captured = capsys.readouterr()
            assert "missing 'migrated' field" in captured.err

    def test_validate_registry_load_failure(self, capsys):
        """Validation fails if registry cannot be loaded."""
        with patch('dispatcher.load_registry', side_effect=FileNotFoundError("Missing")):
            result = validate_registry()

            assert result is False
            captured = capsys.readouterr()
            assert "Registry validation failed" in captured.err


class TestRegistryAllTyper:
    """Test that all commands are using Typer handlers."""

    def test_all_commands_use_typer(self):
        """All commands in registry have handler: typer."""
        registry = load_registry()

        for command, config in registry.items():
            handler = config.get('handler')
            assert handler == 'typer', (
                f"Command '{command}' should use 'typer' handler, found: {handler}"
            )

    def test_no_legacy_handlers_remain(self):
        """No commands have legacy handler type."""
        registry = load_registry()

        legacy_commands = [
            cmd for cmd, config in registry.items()
            if config.get('handler') == 'legacy'
        ]

        assert len(legacy_commands) == 0, (
            f"Legacy handlers should be removed: {legacy_commands}"
        )


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
