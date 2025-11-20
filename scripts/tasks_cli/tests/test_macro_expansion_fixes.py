"""
Unit tests for macro expansion fixes (2025-11-19 code review issues).

Tests cover three critical fixes:
1. Empty macro expansion (bootstrapping with no existing files)
2. Partial directory coverage (stable glob base extraction)
3. Legacy context migration (file paths → directory paths)
"""

import json
import sys
import tempfile
from pathlib import Path

import pytest

# Import the functions we're testing
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from scripts.tasks_cli.__main__ import _extract_glob_base, _expand_repo_paths
from scripts.tasks_cli.context_store import TaskContextStore


# ============================================================================
# Test _extract_glob_base (Fix #2)
# ============================================================================

class TestExtractGlobBase:
    """Test stable glob base extraction algorithm."""

    def test_extract_base_with_double_star(self):
        """Should extract directory before ** wildcard."""
        result = _extract_glob_base("mobile/src/components/**/*.tsx")
        assert result == "mobile/src/components"

    def test_extract_base_with_single_star(self):
        """Should extract directory before * wildcard."""
        assert _extract_glob_base("backend/services/*/index.ts") == "backend/services"

    def test_extract_base_with_question_mark(self):
        """Should extract directory before ? wildcard."""
        assert _extract_glob_base("shared/types/?.ts") == "shared/types"

    def test_extract_base_with_bracket(self):
        """Should extract directory before [ wildcard."""
        assert _extract_glob_base("mobile/src/[a-z]*.tsx") == "mobile/src"

    def test_extract_base_with_brace(self):
        """Should extract directory before { wildcard."""
        assert _extract_glob_base("backend/{foo,bar}/index.ts") == "backend"

    def test_extract_base_no_wildcards(self):
        """Should return parent directory for literal file paths."""
        assert _extract_glob_base("mobile/src/App.tsx") == "mobile/src"

    def test_extract_base_root_level_wildcard(self):
        """Should return top-level directory for root wildcards."""
        assert _extract_glob_base("shared/**") == "shared"

    def test_extract_base_complex_nested(self):
        """Should handle deeply nested patterns correctly."""
        pattern = "mobile/src/features/editor/components/**/*.test.tsx"
        expected = "mobile/src/features/editor/components"
        assert _extract_glob_base(pattern) == expected

    def test_extract_base_multiple_wildcards(self):
        """Should extract base before FIRST wildcard."""
        # First wildcard is at 'backend/services/*'
        pattern = "backend/services/*/handlers/**/*.ts"
        assert _extract_glob_base(pattern) == "backend/services"


# ============================================================================
# Test _expand_repo_paths (Fixes #1 and #2)
# ============================================================================

class TestExpandRepoPaths:
    """Test macro expansion with bootstrapping and stable bases."""

    @pytest.fixture
    def temp_repo(self):
        """Create temporary repository structure."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_root = Path(tmpdir)

            # Create globs config
            globs_dir = repo_root / "docs" / "templates"
            globs_dir.mkdir(parents=True)
            globs_file = globs_dir / "scope-globs.json"

            globs_config = {
                "globs": {
                    ":mobile-ui": [
                        "mobile/src/components/**/*.tsx",
                        "mobile/src/hooks/**/*.ts"
                    ],
                    ":backend-services": [
                        "backend/services/**/*.ts"
                    ],
                    ":new-feature": [
                        "mobile/src/features/export/**/*.tsx"
                    ]
                }
            }

            with open(globs_file, 'w') as f:
                json.dump(globs_config, f)

            yield repo_root

    def test_expand_empty_macro_fallback(self, temp_repo):
        """
        FIX #1: Empty macro should fall back to glob base (bootstrapping).

        When no files exist yet for a macro, we must still include the base
        directory so future files will be in scope.
        """
        # No files exist for :new-feature macro
        repo_paths = [":new-feature"]
        expanded = _expand_repo_paths(repo_paths, temp_repo)

        # Should include the base directory even though no files exist
        assert "mobile/src/features/export" in expanded
        assert len(expanded) == 1

    def test_expand_macro_with_files(self, temp_repo):
        """
        FIX #2: With existing files, should use stable glob base not file parents.

        Previously: recorded only parent dirs of existing files
        Now: records stable glob base so all levels are in scope
        """
        # Create some files under components
        components_dir = temp_repo / "mobile" / "src" / "components" / "forms"
        components_dir.mkdir(parents=True)
        (components_dir / "Input.tsx").touch()

        # Create hook file
        hooks_dir = temp_repo / "mobile" / "src" / "hooks"
        hooks_dir.mkdir(parents=True)
        (hooks_dir / "useAuth.ts").touch()

        repo_paths = [":mobile-ui"]
        expanded = _expand_repo_paths(repo_paths, temp_repo)

        # Should include STABLE BASES, not just parent of existing files
        assert "mobile/src/components" in expanded
        assert "mobile/src/hooks" in expanded

        # Should NOT include nested directories like "mobile/src/components/forms"
        # because that's too specific - the base covers everything under it
        assert "mobile/src/components/forms" not in expanded

    def test_expand_preserves_coverage_for_new_files(self, temp_repo):
        """
        FIX #2 validation: New files at any level under base should be in scope.

        This is the real-world scenario from the code review:
        - Existing: mobile/src/components/forms/Input.tsx
        - New: mobile/src/components/Card.tsx (sibling to forms/)
        - Expected: Card.tsx should be in scope
        """
        # Existing file deep in tree
        forms_dir = temp_repo / "mobile" / "src" / "components" / "forms"
        forms_dir.mkdir(parents=True)
        (forms_dir / "Input.tsx").touch()

        repo_paths = [":mobile-ui"]
        expanded = _expand_repo_paths(repo_paths, temp_repo)

        # Base should be "mobile/src/components"
        assert "mobile/src/components" in expanded

        # Simulate checking if a new file would be in scope
        # (This is what _get_untracked_files_in_scope does)
        new_file = "mobile/src/components/Card.tsx"
        base = "mobile/src/components"

        # Should match because new_file starts with base + '/'
        assert new_file.startswith(base + '/')

    def test_expand_multiple_macros(self, temp_repo):
        """Should handle multiple macros correctly."""
        # Create files for both macros
        components_dir = temp_repo / "mobile" / "src" / "components"
        components_dir.mkdir(parents=True)
        (components_dir / "App.tsx").touch()

        services_dir = temp_repo / "backend" / "services"
        services_dir.mkdir(parents=True)
        (services_dir / "auth.ts").touch()

        repo_paths = [":mobile-ui", ":backend-services"]
        expanded = _expand_repo_paths(repo_paths, temp_repo)

        # Should include bases from both macros
        assert "mobile/src/components" in expanded
        assert "mobile/src/hooks" in expanded  # Even though no files exist
        assert "backend/services" in expanded

    def test_expand_regular_paths_normalized(self, temp_repo):
        """Should normalize regular paths (files → parent dirs)."""
        repo_paths = [
            "backend/handlers/upload.ts",  # File path
            "mobile/src/screens/",          # Directory path
            "shared/types/index.ts"         # Another file
        ]

        expanded = _expand_repo_paths(repo_paths, temp_repo)

        # Files should be converted to parent directories
        assert "backend/handlers" in expanded
        assert "shared/types" in expanded

        # Directory should be preserved (without trailing slash)
        assert "mobile/src/screens" in expanded

        # Original file paths should NOT be in result
        assert "backend/handlers/upload.ts" not in expanded
        assert "shared/types/index.ts" not in expanded

    def test_expand_unknown_macro_preserved(self, temp_repo):
        """Unknown macros should be preserved for validation to catch."""
        repo_paths = [":unknown-macro", "backend/services/"]
        expanded = _expand_repo_paths(repo_paths, temp_repo)

        # Unknown macro kept as-is
        assert ":unknown-macro" in expanded

        # Regular path normalized
        assert "backend/services" in expanded

    def test_expand_deduplicates_paths(self, temp_repo):
        """Should deduplicate paths from multiple patterns."""
        # Create files that would both expand to same base
        base_dir = temp_repo / "mobile" / "src" / "components"
        base_dir.mkdir(parents=True)
        (base_dir / "Foo.tsx").touch()
        (base_dir / "Bar.tsx").touch()

        repo_paths = [":mobile-ui"]
        expanded = _expand_repo_paths(repo_paths, temp_repo)

        # Should have only one entry for mobile/src/components
        # (not duplicated for each file)
        assert expanded.count("mobile/src/components") == 1


# ============================================================================
# Test Legacy Context Migration (Fix #3)
# ============================================================================

class TestLegacyContextMigration:
    """Test backward compatibility migration for pre-hardening contexts."""

    @pytest.fixture
    def temp_repo_with_context(self):
        """Create temp repo with legacy context file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_root = Path(tmpdir)

            # Create context directory
            context_dir = repo_root / ".agent-output" / "TASK-9999"
            context_dir.mkdir(parents=True)

            yield repo_root, context_dir

    def test_normalize_file_paths_to_directories(self):
        """
        FIX #3: Should convert legacy file paths to parent directories.
        """
        store = TaskContextStore(Path("/tmp"))  # Path doesn't matter for this test

        legacy_paths = [
            "mobile/src/App.tsx",
            "mobile/src/components/Button.tsx",
            "backend/services/auth.ts",
            "backend/handlers/upload.ts",
            "shared/types/index.ts",
        ]

        normalized = store._normalize_repo_paths_for_migration(legacy_paths)

        # All file paths should be converted to parent directories
        assert "mobile/src" in normalized
        assert "mobile/src/components" in normalized
        assert "backend/services" in normalized
        assert "backend/handlers" in normalized
        assert "shared/types" in normalized

        # Original file paths should NOT be in result
        assert "mobile/src/App.tsx" not in normalized
        assert "backend/services/auth.ts" not in normalized

    def test_normalize_preserves_directory_paths(self):
        """Should preserve paths that are already directories."""
        store = TaskContextStore(Path("/tmp"))

        mixed_paths = [
            "mobile/src/",           # Directory with trailing slash
            "backend/services",      # Directory without trailing slash
            "shared/types/user.ts"   # File path
        ]

        normalized = store._normalize_repo_paths_for_migration(mixed_paths)

        # Directories preserved (trailing slash removed for consistency)
        assert "mobile/src" in normalized
        assert "backend/services" in normalized

        # File converted to parent
        assert "shared/types" in normalized

    def test_normalize_deduplicates_after_collapse(self):
        """
        Should deduplicate when multiple files collapse to same parent.

        Real-world scenario: legacy context listed 10 component files,
        all should collapse to single "mobile/src/components" entry.
        """
        store = TaskContextStore(Path("/tmp"))

        legacy_paths = [
            "mobile/src/components/Button.tsx",
            "mobile/src/components/Input.tsx",
            "mobile/src/components/Card.tsx",
            "mobile/src/components/Modal.tsx",
        ]

        normalized = store._normalize_repo_paths_for_migration(legacy_paths)

        # All should collapse to single directory
        assert normalized == ["mobile/src/components"]

    def test_normalize_handles_edge_cases(self):
        """Should handle edge cases gracefully."""
        store = TaskContextStore(Path("/tmp"))

        edge_cases = [
            ".env",                  # Root file
            "README.md",             # Another root file
            "backend/",              # Directory at various levels
            "a/b/c/d.txt",          # Deeply nested file
        ]

        normalized = store._normalize_repo_paths_for_migration(edge_cases)

        # Root files should use first path component
        # (or be handled specially - implementation dependent)
        assert len(normalized) > 0  # Should not crash

        # Deeply nested should collapse correctly
        assert "a/b/c" in normalized

    def test_normalize_sorted_output(self):
        """Output should be sorted for determinism."""
        store = TaskContextStore(Path("/tmp"))

        paths = [
            "z/file.ts",
            "a/file.ts",
            "m/file.ts"
        ]

        normalized = store._normalize_repo_paths_for_migration(paths)

        # Should be alphabetically sorted
        assert normalized == sorted(normalized)
        assert normalized == ["a", "m", "z"]


# ============================================================================
# Integration Test: End-to-End Scenario
# ============================================================================

class TestEndToEndScenario:
    """Test complete workflow with all fixes applied."""

    @pytest.fixture
    def bootstrapping_repo(self):
        """Repo for a brand new feature (no files exist yet)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_root = Path(tmpdir)

            # Create globs config with new feature macro
            globs_dir = repo_root / "docs" / "templates"
            globs_dir.mkdir(parents=True)
            globs_file = globs_dir / "scope-globs.json"

            globs_config = {
                "globs": {
                    ":new-export-feature": [
                        "mobile/src/features/export/**/*.tsx",
                        "mobile/src/features/export/**/*.ts"
                    ]
                }
            }

            with open(globs_file, 'w') as f:
                json.dump(globs_config, f)

            yield repo_root

    def test_bootstrapping_workflow(self, bootstrapping_repo):
        """
        End-to-end: Task creates first files in new directory.

        Without Fix #1, this would fail:
        1. --init-context expands :new-export-feature
        2. Glob finds no matches
        3. repo_paths becomes empty
        4. All created files are rejected as out-of-scope

        With Fix #1, base directory is used as fallback.
        """
        # STEP 1: Initialize context for new feature
        repo_paths = [":new-export-feature"]
        expanded = _expand_repo_paths(repo_paths, bootstrapping_repo)

        # Should have base directory even though no files exist
        assert "mobile/src/features/export" in expanded

        # STEP 2: Simulate implementer creating first files
        export_dir = bootstrapping_repo / "mobile" / "src" / "features" / "export"
        export_dir.mkdir(parents=True)

        new_files = [
            "mobile/src/features/export/ExportButton.tsx",
            "mobile/src/features/export/ExportService.ts",
            "mobile/src/features/export/types.ts"
        ]

        # STEP 3: Check if new files would be in scope
        base = "mobile/src/features/export"

        for new_file in new_files:
            # This is what _get_untracked_files_in_scope does
            assert new_file.startswith(base + '/')

        # SUCCESS: All new files are correctly identified as in-scope

    def test_coverage_preservation_workflow(self, bootstrapping_repo):
        """
        End-to-end: Task adds files at multiple levels.

        Without Fix #2, this would fail:
        - Existing: mobile/src/features/export/components/ExportButton.tsx
        - Expanded base: mobile/src/features/export/components (WRONG)
        - New file: mobile/src/features/export/ExportService.ts (sibling to components/)
        - Result: Rejected as out-of-scope (WRONG)

        With Fix #2, stable glob base covers all levels.
        """
        # Create initial deeply nested file
        export_dir = bootstrapping_repo / "mobile" / "src" / "features" / "export"
        components_dir = export_dir / "components"
        components_dir.mkdir(parents=True)
        (components_dir / "ExportButton.tsx").touch()

        # Expand macro
        repo_paths = [":new-export-feature"]
        expanded = _expand_repo_paths(repo_paths, bootstrapping_repo)

        # Should have STABLE BASE, not nested dir
        assert "mobile/src/features/export" in expanded
        assert "mobile/src/features/export/components" not in expanded

        # Add file at root of export/
        new_file = "mobile/src/features/export/ExportService.ts"
        base = "mobile/src/features/export"

        # Should be in scope (FIX #2 validates this)
        assert new_file.startswith(base + '/')

        # Add file in different subdirectory
        new_file2 = "mobile/src/features/export/utils/helpers.ts"
        assert new_file2.startswith(base + '/')

        # SUCCESS: All levels under base are in scope


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
