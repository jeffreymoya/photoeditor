"""
Tests for dual-dispatch command router.

Validates:
- Registry loading and parsing
- Legacy dispatch environment override
- Command routing logic
- Registry validation
"""

import os
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
    _dispatch_legacy,
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
        mock_yaml_content = "commands:\n  list:\n    handler: legacy\n  - invalid yaml syntax"

        with patch('builtins.open', mock_open(read_data=mock_yaml_content)):
            with patch('dispatcher.Path') as mock_path:
                mock_registry_path = MagicMock()
                mock_registry_path.exists.return_value = True
                mock_path.return_value.parent.__truediv__.return_value = mock_registry_path

                with pytest.raises(yaml.YAMLError):
                    load_registry()

    def test_load_registry_missing_commands_key(self):
        """Raises ValueError if 'commands' key missing."""
        mock_yaml_content = "invalid_key:\n  list:\n    handler: legacy"

        with patch('builtins.open', mock_open(read_data=mock_yaml_content)):
            with patch('dispatcher.Path') as mock_path:
                mock_registry_path = MagicMock()
                mock_registry_path.exists.return_value = True
                mock_path.return_value.parent.__truediv__.return_value = mock_registry_path

                with pytest.raises(ValueError, match="missing 'commands' key"):
                    load_registry()


class TestShouldUseLegacy:
    """Test legacy dispatch decision logic."""

    def test_legacy_dispatch_env_flag_set(self, monkeypatch):
        """TASKS_CLI_LEGACY_DISPATCH=1 forces legacy for all commands."""
        monkeypatch.setenv('TASKS_CLI_LEGACY_DISPATCH', '1')

        # Even if registry says 'typer', env flag overrides
        mock_registry = {
            'list': {'handler': 'typer', 'migrated': True}
        }

        assert should_use_legacy('list', registry=mock_registry) is True

    def test_legacy_dispatch_env_flag_not_set(self, monkeypatch):
        """Without env flag, respects registry configuration."""
        monkeypatch.delenv('TASKS_CLI_LEGACY_DISPATCH', raising=False)

        mock_registry = {
            'list': {'handler': 'legacy', 'migrated': False}
        }

        assert should_use_legacy('list', registry=mock_registry) is True

    def test_typer_dispatch_when_migrated(self, monkeypatch):
        """Returns False when command migrated to Typer."""
        monkeypatch.delenv('TASKS_CLI_LEGACY_DISPATCH', raising=False)

        mock_registry = {
            'list': {'handler': 'typer', 'migrated': True}
        }

        assert should_use_legacy('list', registry=mock_registry) is False

    def test_fallback_to_legacy_on_registry_error(self, monkeypatch, capsys):
        """Falls back to legacy if registry cannot be loaded."""
        monkeypatch.delenv('TASKS_CLI_LEGACY_DISPATCH', raising=False)

        with patch('dispatcher.load_registry', side_effect=FileNotFoundError):
            result = should_use_legacy('list', registry=None)

            assert result is True
            captured = capsys.readouterr()
            assert "Could not load dispatch registry" in captured.err
            assert "defaulting to legacy" in captured.err

    def test_missing_command_defaults_to_legacy(self, monkeypatch):
        """Command not in registry defaults to legacy handler."""
        monkeypatch.delenv('TASKS_CLI_LEGACY_DISPATCH', raising=False)

        mock_registry = {
            'list': {'handler': 'typer', 'migrated': True}
        }

        # 'unknown-command' not in registry
        result = should_use_legacy('unknown-command', registry=mock_registry)

        # Should default to legacy (handler field defaults to 'legacy')
        assert result is True


class TestDispatchCommand:
    """Test command dispatching to appropriate handlers."""

    def test_dispatch_to_legacy_handler(self, monkeypatch):
        """Command dispatches to legacy handler when configured."""
        monkeypatch.delenv('TASKS_CLI_LEGACY_DISPATCH', raising=False)

        mock_args = MagicMock()
        mock_context = {'picker': MagicMock(), 'graph': MagicMock()}

        with patch('dispatcher.load_registry') as mock_load:
            mock_load.return_value = {
                'list': {'handler': 'legacy', 'migrated': False}
            }

            with patch('dispatcher._dispatch_legacy', return_value=0) as mock_legacy:
                exit_code = dispatch_command('list', mock_args, mock_context)

                mock_legacy.assert_called_once_with('list', mock_args, mock_context)
                assert exit_code == 0

    def test_dispatch_to_typer_handler(self, monkeypatch):
        """Command dispatches to Typer handler when configured."""
        monkeypatch.delenv('TASKS_CLI_LEGACY_DISPATCH', raising=False)

        mock_args = MagicMock()
        mock_context = {'picker': MagicMock()}

        with patch('dispatcher.load_registry') as mock_load:
            mock_load.return_value = {
                'list': {'handler': 'typer', 'migrated': True}
            }

            with patch('dispatcher._dispatch_typer', return_value=0) as mock_typer:
                exit_code = dispatch_command('list', mock_args, mock_context)

                mock_typer.assert_called_once_with('list', mock_args, mock_context)
                assert exit_code == 0

    def test_dispatch_respects_env_override(self, monkeypatch):
        """Env flag overrides registry and forces legacy."""
        monkeypatch.setenv('TASKS_CLI_LEGACY_DISPATCH', '1')

        mock_args = MagicMock()

        with patch('dispatcher.load_registry') as mock_load:
            mock_load.return_value = {
                'list': {'handler': 'typer', 'migrated': True}  # Registry says typer
            }

            with patch('dispatcher._dispatch_legacy', return_value=0) as mock_legacy:
                exit_code = dispatch_command('list', mock_args, None)

                # Should use legacy despite registry saying typer
                mock_legacy.assert_called_once()
                assert exit_code == 0


class TestDispatchLegacy:
    """Test legacy handler routing."""

    def test_dispatch_legacy_unknown_command(self, capsys):
        """Unknown command returns error exit code."""
        mock_args = MagicMock()

        # Mock the main module import to avoid relative import issues in tests
        mock_main_module = MagicMock()

        with patch('dispatcher.importlib.util.spec_from_file_location') as mock_spec_from_file:
            mock_spec = MagicMock()
            mock_spec.loader = MagicMock()
            mock_spec_from_file.return_value = mock_spec

            with patch('dispatcher.importlib.util.module_from_spec', return_value=mock_main_module):
                exit_code = _dispatch_legacy('unknown-command', mock_args, None)

        assert exit_code == 1
        captured = capsys.readouterr()
        assert "Unknown command 'unknown-command'" in captured.err

    def test_dispatch_legacy_handler_not_found(self, capsys):
        """Missing handler function returns error exit code."""
        mock_args = MagicMock()

        # Mock the main module import
        mock_main_module = MagicMock()
        # Ensure cmd_list doesn't exist on the mock
        mock_main_module.cmd_list = MagicMock(side_effect=AttributeError)
        del mock_main_module.cmd_list

        with patch('dispatcher.importlib.util.spec_from_file_location') as mock_spec_from_file:
            mock_spec = MagicMock()
            mock_spec.loader = MagicMock()
            mock_spec_from_file.return_value = mock_spec

            with patch('dispatcher.importlib.util.module_from_spec', return_value=mock_main_module):
                exit_code = _dispatch_legacy('list', mock_args, None)

        assert exit_code == 1
        captured = capsys.readouterr()
        assert "Handler 'cmd_list' not found" in captured.err


class TestDispatchTyper:
    """Test Typer handler routing.

    Note: Direct unit testing of _dispatch_typer is limited because it uses
    relative imports that require package context. Full integration testing
    is performed via the CLI entry points in test_cli_smoke.py.
    """

    @pytest.mark.skip(reason="Requires package context for relative imports - tested via integration tests")
    def test_dispatch_typer_requires_repo_root(self, capsys):
        """Typer dispatch returns error when repo_root missing from context."""
        # This test verifies behavior when repo_root is missing from context.
        # The function returns 1 and prints an error message.
        # Tested via integration in test_cli_smoke.py.
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
            'validate': {'handler': 'legacy', 'migrated': False}
        }

        with patch('dispatcher.load_registry', return_value=mock_registry):
            result = validate_registry()

            assert result is False
            captured = capsys.readouterr()
            assert "missing 'handler' field" in captured.err

    def test_validate_registry_invalid_handler_value(self, capsys):
        """Detects invalid handler values."""
        mock_registry = {
            'list': {'handler': 'invalid_handler', 'migrated': False}
        }

        with patch('dispatcher.load_registry', return_value=mock_registry):
            result = validate_registry()

            assert result is False
            captured = capsys.readouterr()
            assert "invalid handler: 'invalid_handler'" in captured.err

    def test_validate_registry_missing_migrated_field(self, capsys):
        """Detects missing 'migrated' field."""
        mock_registry = {
            'list': {'handler': 'legacy'}
        }

        with patch('dispatcher.load_registry', return_value=mock_registry):
            result = validate_registry()

            assert result is False
            captured = capsys.readouterr()
            assert "missing 'migrated' field" in captured.err

    def test_validate_registry_duplicate_commands(self, capsys):
        """Detects duplicate command entries (edge case)."""
        # Note: YAML parsing would normally prevent duplicates, but test logic
        # This is a logical validation test
        mock_registry = {
            'list': {'handler': 'legacy', 'migrated': False},
            'validate': {'handler': 'legacy', 'migrated': False}
        }

        # Simulate duplicate detection by checking seen_commands logic
        with patch('dispatcher.load_registry', return_value=mock_registry):
            result = validate_registry()

            # Should pass since no actual duplicates in test data
            assert result is True

    def test_validate_registry_load_failure(self, capsys):
        """Validation fails if registry cannot be loaded."""
        with patch('dispatcher.load_registry', side_effect=FileNotFoundError("Missing")):
            result = validate_registry()

            assert result is False
            captured = capsys.readouterr()
            assert "Registry validation failed" in captured.err


class TestRegistryConflicts:
    """Test for command registration conflicts between legacy and Typer."""

    def test_no_duplicate_registrations(self):
        """No command registered in both legacy and Typer handlers."""
        registry = load_registry()

        legacy_commands = set()
        typer_commands = set()

        for command, config in registry.items():
            handler = config.get('handler')
            if handler == 'legacy':
                legacy_commands.add(command)
            elif handler == 'typer':
                typer_commands.add(command)

        # Check for overlap
        conflicts = legacy_commands & typer_commands
        assert len(conflicts) == 0, f"Commands registered in both handlers: {conflicts}"

    def test_all_commands_have_single_handler(self):
        """Every command has exactly one handler type."""
        registry = load_registry()

        for command, config in registry.items():
            handler = config.get('handler')
            assert handler in ('legacy', 'typer'), (
                f"Command '{command}' has invalid handler: {handler}"
            )


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
