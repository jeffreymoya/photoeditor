"""Standards citation helper functions for context initialization."""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..context_store import TaskContextStore


def _extract_standards_citations(
    context_store: 'TaskContextStore',
    task_id: str,
    area: str,
    priority: str,
    task_data: dict
) -> list:
    """Extract standards citations with actual content from referenced files."""
    citations = []

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

    files_to_extract = set()

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

    files_to_extract.update([
        'standards/global.md',
        'standards/AGENTS.md',
        'standards/testing-standards.md',
    ])

    context = task_data.get('context', {})
    if isinstance(context, dict):
        related_docs = context.get('related_docs', [])
        if isinstance(related_docs, list):
            for doc in related_docs:
                doc_str = str(doc)
                if doc_str.startswith('standards/'):
                    files_to_extract.add(doc_str)

    for standards_file in sorted(files_to_extract):
        sections = section_map.get(standards_file, [])
        if not sections:
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
                pass

        for section_heading in sections:
            try:
                excerpt = context_store.extract_standards_excerpt(
                    task_id=task_id,
                    standards_file=standards_file,
                    section_heading=section_heading
                )
                citations.append(excerpt.to_dict())
            except (FileNotFoundError, ValueError):
                pass

    return citations


def _build_standards_citations(area: str, priority: str, task_data: dict) -> list:
    """Build standards citations based on task area and priority."""
    citations = []

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

    if area in ('backend', 'mobile', 'shared'):
        citations.append({
            'file': 'standards/typescript.md',
            'section': 'strict-config',
            'requirement': 'Strict tsconfig including exactOptionalPropertyTypes; Zod at boundaries; neverthrow Results',
            'line_span': None,
            'content_sha': None,
        })

    citations.append({
        'file': 'standards/testing-standards.md',
        'section': f'{area}-qa-commands',
        'requirement': f'QA commands and coverage thresholds for {area}',
        'line_span': None,
        'content_sha': None,
    })

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
