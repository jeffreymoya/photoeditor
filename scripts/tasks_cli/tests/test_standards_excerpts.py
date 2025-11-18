"""
Unit tests for standards excerpt extraction functionality.

Tests Section 7 of task-context-cache-hardening-schemas.md.
"""

import pytest
from pathlib import Path
import tempfile
import shutil
import hashlib

from scripts.tasks_cli.context_store import (
    TaskContextStore,
    StandardsExcerpt,
)


@pytest.fixture
def temp_repo():
    """Create temporary repository structure."""
    tmpdir = Path(tempfile.mkdtemp())

    # Create standards directory
    standards_dir = tmpdir / 'standards'
    standards_dir.mkdir()

    yield tmpdir

    # Cleanup
    shutil.rmtree(tmpdir)


@pytest.fixture
def sample_standards_file(temp_repo):
    """Create sample standards markdown file."""
    standards_file = temp_repo / 'standards' / 'backend-tier.md'

    content = """# Backend Tier

## Edge & Interface Layer

**Framework**

* **NestJS** (DI, modules).
* **@nestjs/terminus** for health.

## Lambda Application Layer

**Libraries**

* **Middy** (timeouts, input/output validation).
* **AWS Powertools for TypeScript** (Logger/Metrics/Tracer).

**Patterns**

* **Function-per-concern** with clear input/output schemas.
* **Idempotency utility** (Powertools idempotency or custom with DynamoDB).

### Nested Subsection

This is a nested subsection under Lambda Application Layer.

## Domain Service Layer

**Libraries**

* **neverthrow** (Result/Either) for error/flow control.
* **OneTable** for DynamoDB modeling.

**Patterns**

* **DDD-lite**: domain services with pure functions where possible.
* **State machine** (XState) definitions reside in `shared/statecharts`.
"""

    standards_file.write_text(content, encoding='utf-8')
    return standards_file


@pytest.fixture
def context_store(temp_repo):
    """Create TaskContextStore instance."""
    return TaskContextStore(temp_repo)


class TestSectionBoundaryDetection:
    """Test section boundary detection for different heading levels."""

    def test_find_level_2_heading(self, context_store, sample_standards_file):
        """Test finding ## level heading."""
        content = sample_standards_file.read_text()
        boundaries = context_store._find_section_boundaries(content, "Edge & Interface Layer")

        assert boundaries is not None
        start, end = boundaries

        # Content should start after heading line
        lines = content.split('\n')
        assert lines[start].strip() == ""  # First line after heading is blank

        # Content should end at next ## heading
        assert lines[end].startswith("## Lambda Application Layer")

    def test_find_level_3_heading(self, context_store, sample_standards_file):
        """Test finding ### level (nested subsection)."""
        content = sample_standards_file.read_text()
        boundaries = context_store._find_section_boundaries(content, "Nested Subsection")

        assert boundaries is not None
        start, end = boundaries

        lines = content.split('\n')
        # Should end at next same-level or higher-level heading (##)
        assert lines[end].startswith("## Domain Service Layer")

    def test_section_at_eof(self, context_store, sample_standards_file):
        """Test section that extends to end of file."""
        content = sample_standards_file.read_text()
        boundaries = context_store._find_section_boundaries(content, "Domain Service Layer")

        assert boundaries is not None
        start, end = boundaries

        lines = content.split('\n')
        # Should extend to EOF
        assert end == len(lines)

    def test_section_not_found(self, context_store, sample_standards_file):
        """Test section that doesn't exist."""
        content = sample_standards_file.read_text()
        boundaries = context_store._find_section_boundaries(content, "Nonexistent Section")

        assert boundaries is None

    def test_heading_normalization(self, context_store, sample_standards_file):
        """Test heading normalization (case, spaces, ampersands)."""
        content = sample_standards_file.read_text()

        # Should find "Edge & Interface Layer" with different casing/spacing
        boundaries1 = context_store._find_section_boundaries(content, "edge-and-interface-layer")
        boundaries2 = context_store._find_section_boundaries(content, "Edge & Interface Layer")

        assert boundaries1 == boundaries2


class TestContentExtraction:
    """Test content extraction excludes heading line."""

    def test_heading_excluded(self, context_store, sample_standards_file, temp_repo):
        """Test that heading line is excluded from excerpt."""
        excerpt = context_store.extract_standards_excerpt(
            'TASK-TEST',
            'standards/backend-tier.md',
            'Lambda Application Layer'
        )

        # Read the cached excerpt
        cached_file = temp_repo / excerpt.cached_path
        cached_content = cached_file.read_text()

        # Should not contain the heading line
        assert "## Lambda Application Layer" not in cached_content

        # Should contain the content after the heading
        assert "**Libraries**" in cached_content

    def test_blank_lines_trimmed(self, context_store, temp_repo):
        """Test blank lines are trimmed from start/end."""
        # Create test file with extra blank lines
        test_file = temp_repo / 'standards' / 'test.md'
        content = """# Test

## Section With Blanks


Content line 1.
Content line 2.


## Next Section
"""
        test_file.write_text(content)

        excerpt = context_store.extract_standards_excerpt(
            'TASK-TEST',
            'standards/test.md',
            'Section With Blanks'
        )

        cached_file = temp_repo / excerpt.cached_path
        cached_content = cached_file.read_text()

        # Should not start or end with blank lines
        assert not cached_content.startswith('\n\n')
        assert not cached_content.endswith('\n\n\n')

        # Should have content
        assert "Content line 1." in cached_content

    def test_no_body_content(self, context_store, temp_repo):
        """Test section with no body content (only heading)."""
        test_file = temp_repo / 'standards' / 'test.md'
        content = """# Test

## Empty Section

## Next Section
"""
        test_file.write_text(content)

        excerpt = context_store.extract_standards_excerpt(
            'TASK-TEST',
            'standards/test.md',
            'Empty Section'
        )

        # Should have empty content but valid hash
        assert excerpt.content_sha256 is not None
        assert len(excerpt.excerpt_id) == 8


class TestDeterministicHashing:
    """Test deterministic SHA256 hashing."""

    def test_same_content_same_hash(self, context_store, temp_repo):
        """Test identical content produces identical hash."""
        test_file = temp_repo / 'standards' / 'test.md'
        content = """# Test

## Section

Content line.
"""
        test_file.write_text(content)

        excerpt1 = context_store.extract_standards_excerpt(
            'TASK-TEST1',
            'standards/test.md',
            'Section'
        )

        excerpt2 = context_store.extract_standards_excerpt(
            'TASK-TEST2',
            'standards/test.md',
            'Section'
        )

        assert excerpt1.content_sha256 == excerpt2.content_sha256
        assert excerpt1.excerpt_id == excerpt2.excerpt_id

    def test_hash_normalization(self, context_store, temp_repo):
        """Test hash normalization (trailing whitespace, multiple blanks)."""
        # Create two files with same content but different whitespace
        file1 = temp_repo / 'standards' / 'test1.md'
        file2 = temp_repo / 'standards' / 'test2.md'

        content1 = """# Test

## Section

Line 1.
Line 2.


Line 3.
"""

        content2 = """# Test

## Section

Line 1.
Line 2.

Line 3.
"""

        file1.write_text(content1)
        file2.write_text(content2)

        excerpt1 = context_store.extract_standards_excerpt(
            'TASK-TEST1',
            'standards/test1.md',
            'Section'
        )

        excerpt2 = context_store.extract_standards_excerpt(
            'TASK-TEST2',
            'standards/test2.md',
            'Section'
        )

        # After normalization, hashes should match
        assert excerpt1.content_sha256 == excerpt2.content_sha256


class TestExcerptCaching:
    """Test excerpt caching to evidence directory."""

    def test_excerpt_cached_with_id(self, context_store, sample_standards_file, temp_repo):
        """Test excerpt is cached with 8-char ID prefix."""
        excerpt = context_store.extract_standards_excerpt(
            'TASK-TEST',
            'standards/backend-tier.md',
            'Lambda Application Layer'
        )

        # Check file created
        cached_path = temp_repo / excerpt.cached_path
        assert cached_path.exists()

        # Check filename uses excerpt_id
        assert excerpt.excerpt_id in cached_path.name
        assert cached_path.suffix == '.md'

    def test_index_updated(self, context_store, sample_standards_file, temp_repo):
        """Test index.json is created/updated."""
        excerpt = context_store.extract_standards_excerpt(
            'TASK-TEST',
            'standards/backend-tier.md',
            'Lambda Application Layer'
        )

        index_path = temp_repo / '.agent-output' / 'TASK-TEST' / 'evidence' / 'standards' / 'index.json'
        assert index_path.exists()

        import json
        with open(index_path) as f:
            index = json.load(f)

        assert 'excerpts' in index
        assert len(index['excerpts']) == 1
        assert index['excerpts'][0]['excerpt_id'] == excerpt.excerpt_id

    def test_multiple_excerpts(self, context_store, sample_standards_file, temp_repo):
        """Test multiple excerpts cached in same index."""
        excerpt1 = context_store.extract_standards_excerpt(
            'TASK-TEST',
            'standards/backend-tier.md',
            'Lambda Application Layer'
        )

        excerpt2 = context_store.extract_standards_excerpt(
            'TASK-TEST',
            'standards/backend-tier.md',
            'Domain Service Layer'
        )

        index_path = temp_repo / '.agent-output' / 'TASK-TEST' / 'evidence' / 'standards' / 'index.json'

        import json
        with open(index_path) as f:
            index = json.load(f)

        assert len(index['excerpts']) == 2
        excerpt_ids = {e['excerpt_id'] for e in index['excerpts']}
        assert excerpt1.excerpt_id in excerpt_ids
        assert excerpt2.excerpt_id in excerpt_ids


class TestFreshnessVerification:
    """Test freshness verification detects stale excerpts."""

    def test_fresh_excerpt(self, context_store, sample_standards_file):
        """Test fresh excerpt verification."""
        excerpt = context_store.extract_standards_excerpt(
            'TASK-TEST',
            'standards/backend-tier.md',
            'Lambda Application Layer'
        )

        # Should be fresh immediately after extraction
        assert context_store.verify_excerpt_freshness(excerpt) is True

    def test_stale_after_content_change(self, context_store, sample_standards_file, temp_repo):
        """Test excerpt becomes stale when standards file changes."""
        excerpt = context_store.extract_standards_excerpt(
            'TASK-TEST',
            'standards/backend-tier.md',
            'Lambda Application Layer'
        )

        # Modify the standards file
        modified_content = sample_standards_file.read_text().replace(
            '* **Middy**',
            '* **Middy v3**'
        )
        sample_standards_file.write_text(modified_content)

        # Should now be stale
        assert context_store.verify_excerpt_freshness(excerpt) is False

    def test_stale_when_file_deleted(self, context_store, sample_standards_file):
        """Test excerpt is stale when standards file deleted."""
        excerpt = context_store.extract_standards_excerpt(
            'TASK-TEST',
            'standards/backend-tier.md',
            'Lambda Application Layer'
        )

        # Delete the file
        sample_standards_file.unlink()

        # Should be stale
        assert context_store.verify_excerpt_freshness(excerpt) is False

    def test_stale_when_section_removed(self, context_store, sample_standards_file):
        """Test excerpt is stale when section removed from file."""
        excerpt = context_store.extract_standards_excerpt(
            'TASK-TEST',
            'standards/backend-tier.md',
            'Lambda Application Layer'
        )

        # Remove the section
        content = sample_standards_file.read_text()
        # Remove everything between Lambda and Domain headings
        modified = content.split('## Lambda Application Layer')[0] + \
                   '## Domain Service Layer' + \
                   content.split('## Domain Service Layer')[1]
        sample_standards_file.write_text(modified)

        # Should be stale
        assert context_store.verify_excerpt_freshness(excerpt) is False


class TestCacheInvalidation:
    """Test cache invalidation removes stale excerpts."""

    def test_invalidate_removes_stale(self, context_store, sample_standards_file, temp_repo):
        """Test invalidation removes stale excerpts and files."""
        # Extract excerpt
        excerpt = context_store.extract_standards_excerpt(
            'TASK-TEST',
            'standards/backend-tier.md',
            'Lambda Application Layer'
        )

        cached_path = temp_repo / excerpt.cached_path
        assert cached_path.exists()

        # Modify standards file
        modified_content = sample_standards_file.read_text().replace(
            '* **Middy**',
            '* **Middy v3**'
        )
        sample_standards_file.write_text(modified_content)

        # Invalidate stale excerpts
        stale_ids = context_store.invalidate_stale_excerpts('TASK-TEST')

        assert excerpt.excerpt_id in stale_ids
        assert not cached_path.exists()

    def test_invalidate_updates_index(self, context_store, sample_standards_file, temp_repo):
        """Test invalidation updates index to remove stale entries."""
        # Extract two excerpts
        excerpt1 = context_store.extract_standards_excerpt(
            'TASK-TEST',
            'standards/backend-tier.md',
            'Lambda Application Layer'
        )

        excerpt2 = context_store.extract_standards_excerpt(
            'TASK-TEST',
            'standards/backend-tier.md',
            'Domain Service Layer'
        )

        # Modify only Lambda section
        content = sample_standards_file.read_text()
        modified = content.replace(
            '* **Middy**',
            '* **Middy v3**'
        )
        sample_standards_file.write_text(modified)

        # Invalidate
        stale_ids = context_store.invalidate_stale_excerpts('TASK-TEST')

        # Only Lambda excerpt should be invalidated
        assert excerpt1.excerpt_id in stale_ids
        assert excerpt2.excerpt_id not in stale_ids

        # Check index
        index_path = temp_repo / '.agent-output' / 'TASK-TEST' / 'evidence' / 'standards' / 'index.json'
        import json
        with open(index_path) as f:
            index = json.load(f)

        assert len(index['excerpts']) == 1
        assert index['excerpts'][0]['excerpt_id'] == excerpt2.excerpt_id

    def test_invalidate_no_excerpts(self, context_store, temp_repo):
        """Test invalidation when no excerpts exist."""
        stale_ids = context_store.invalidate_stale_excerpts('TASK-NONEXISTENT')
        assert stale_ids == []


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_file_not_found(self, context_store):
        """Test error when standards file doesn't exist."""
        with pytest.raises(FileNotFoundError):
            context_store.extract_standards_excerpt(
                'TASK-TEST',
                'standards/nonexistent.md',
                'Some Section'
            )

    def test_section_not_found(self, context_store, sample_standards_file):
        """Test error when section doesn't exist."""
        with pytest.raises(ValueError, match="not found"):
            context_store.extract_standards_excerpt(
                'TASK-TEST',
                'standards/backend-tier.md',
                'Nonexistent Section'
            )

    def test_extract_id_is_8_chars(self, context_store, sample_standards_file):
        """Test excerpt_id is always 8 characters."""
        excerpt = context_store.extract_standards_excerpt(
            'TASK-TEST',
            'standards/backend-tier.md',
            'Lambda Application Layer'
        )

        assert len(excerpt.excerpt_id) == 8
        assert all(c in '0123456789abcdef' for c in excerpt.excerpt_id)

    def test_requirement_truncated_to_140_chars(self, context_store, temp_repo):
        """Test requirement is truncated to 140 characters."""
        test_file = temp_repo / 'standards' / 'test.md'
        long_sentence = "This is a very long sentence that exceeds one hundred and forty characters and should be truncated to fit within the limit specified in the schema documentation for requirement summaries."
        content = f"""# Test

## Long Section

{long_sentence}
"""
        test_file.write_text(content)

        excerpt = context_store.extract_standards_excerpt(
            'TASK-TEST',
            'standards/test.md',
            'Long Section'
        )

        assert len(excerpt.requirement) <= 140

    def test_line_span_accuracy(self, context_store, sample_standards_file):
        """Test line_span reflects actual content boundaries."""
        excerpt = context_store.extract_standards_excerpt(
            'TASK-TEST',
            'standards/backend-tier.md',
            'Lambda Application Layer'
        )

        start, end = excerpt.line_span

        # Verify line span is reasonable
        assert start > 0
        assert end > start

        # Verify lines correspond to section content
        content = sample_standards_file.read_text()
        lines = content.split('\n')
        section_content = '\n'.join(lines[start:end])

        # Should contain Libraries heading but not Lambda Application Layer heading
        assert '**Libraries**' in section_content
        assert '## Lambda Application Layer' not in section_content
