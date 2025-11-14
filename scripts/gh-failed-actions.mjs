#!/usr/bin/env node

/**
 * gh-failed-actions.mjs
 *
 * Surfaced failing GitHub Actions runs (per branch/commit/PR) together with
 * the failed jobs, failed steps, and a tail of the relevant log output.
 *
 * Examples:
 *   ./scripts/gh-failed-actions.mjs --pr 123
 *   ./scripts/gh-failed-actions.mjs --branch feature/payment --max-log-lines 80
 *   ./scripts/gh-failed-actions.mjs --commit abc123 --limit 3 --repo my-org/my-repo
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const DEFAULT_FAILURE_LIMIT = 5;
const DEFAULT_LOG_LINES = 120;

main().catch((error) => {
  console.error(`\nERROR: ${error.message}`);
  process.exit(1);
});

async function main() {
  const options = parseArgs();
  const repo = options.repo ?? detectRepo();
  const repoArgs = repo ? ['--repo', repo] : [];

  const prContext = options.pr ? resolvePullRequest(options.pr, repoArgs) : null;
  if (prContext) {
    options.branch ??= prContext.headRefName;
    options.commit ??= prContext.headRefOid;
  }

  if (!options.run && !options.branch && !options.commit) {
    options.branch = detectCurrentBranch();
  }

  const runs = options.run
    ? [fetchRunById(options.run, repoArgs)]
    : fetchFailedRuns({ ...options, repoArgs });

  const failingRuns = runs.filter((run) => run && run.conclusion && run.conclusion.toLowerCase() !== 'success');
  if (!failingRuns.length) {
    console.log('No failing workflow runs detected for the requested parameters.');
    return;
  }

  failingRuns.slice(0, options.limit).forEach((run, index) => {
    if (index > 0) {
      console.log('\n' + '-'.repeat(80) + '\n');
    }

    printRunHeader(run, repo);

    const jobs = fetchJobsForRun(repo, run.databaseId);
    printJobFailures(jobs);

    if (options.includeLogs) {
      const logSnippet = fetchFailedLogs(run.databaseId, repoArgs, options.maxLogLines);
      printLogSnippet(logSnippet, options.maxLogLines);
    }
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    branch: null,
    commit: null,
    pr: null,
    run: null,
    repo: null,
    limit: DEFAULT_FAILURE_LIMIT,
    includeLogs: true,
    maxLogLines: DEFAULT_LOG_LINES,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
      case '--branch':
        options.branch = requireValue(args, ++i, '--branch');
        break;
      case '--commit':
        options.commit = requireValue(args, ++i, '--commit');
        break;
      case '--pr':
        options.pr = requireValue(args, ++i, '--pr');
        break;
      case '--run':
        options.run = requireValue(args, ++i, '--run');
        break;
      case '--repo':
        options.repo = requireValue(args, ++i, '--repo');
        break;
      case '--limit':
        options.limit = Number(requireValue(args, ++i, '--limit'));
        break;
      case '--max-log-lines':
        options.maxLogLines = Number(requireValue(args, ++i, '--max-log-lines'));
        break;
      case '--no-logs':
        options.includeLogs = false;
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }

  if (Number.isNaN(options.limit) || options.limit < 1) {
    throw new Error('--limit must be a positive number');
  }
  if (Number.isNaN(options.maxLogLines) || options.maxLogLines < 1) {
    throw new Error('--max-log-lines must be a positive number');
  }

  return options;
}

function printUsage() {
  console.log(`Retrieve failing GitHub Actions runs and detailed errors.

Usage:
  ./scripts/gh-failed-actions.mjs [options]

Options:
  --branch <name>        Filter runs by branch (defaults to current branch)
  --commit <sha>         Filter runs by commit SHA
  --pr <number>          Filter runs by pull request number
  --run <id>             Inspect a specific run id
  --repo <owner/name>    Target a different repository
  --limit <n>            Maximum failing runs to display (default ${DEFAULT_FAILURE_LIMIT})
  --max-log-lines <n>    Tail length for failed logs (default ${DEFAULT_LOG_LINES})
  --no-logs              Skip pulling the failed-step logs
  -h, --help             Show this help text
`);
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function detectRepo() {
  try {
    const output = execGh(['repo', 'view', '--json', 'nameWithOwner']);
    const parsed = JSON.parse(output);
    if (!parsed.nameWithOwner) {
      throw new Error();
    }
    return parsed.nameWithOwner;
  } catch {
    throw new Error('Unable to determine repository. Pass --repo or run inside a GitHub repository.');
  }
}

function detectCurrentBranch() {
  const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error('Unable to detect the current branch. Pass --branch explicitly.');
  }
  return result.stdout.trim();
}

function resolvePullRequest(prNumber, repoArgs) {
  const output = execGh(['pr', 'view', String(prNumber), '--json', 'headRefName,headRefOid,url', ...repoArgs]);
  const parsed = JSON.parse(output);
  if (!parsed.headRefName || !parsed.headRefOid) {
    throw new Error(`Unable to resolve PR #${prNumber}`);
  }
  return parsed;
}

function fetchRunById(runId, repoArgs) {
  const fields = 'databaseId,headBranch,headSha,displayTitle,workflowName,conclusion,status,createdAt,updatedAt,url';
  const raw = execGh(['run', 'view', String(runId), '--json', fields, ...repoArgs]);
  const parsed = JSON.parse(raw);
  parsed.databaseId ??= Number(runId);
  return parsed;
}

function fetchFailedRuns({ branch, commit, limit, repoArgs }) {
  const listFields = [
    'databaseId',
    'headBranch',
    'headSha',
    'displayTitle',
    'workflowName',
    'conclusion',
    'status',
    'createdAt',
    'updatedAt',
    'url',
  ].join(',');

  const listLimit = Math.max(limit * 3, limit + 5, 10);
  const args = ['run', 'list', '--status', 'completed', '--limit', String(listLimit), '--json', listFields];
  if (commit) {
    args.push('--commit', commit);
  } else if (branch) {
    args.push('--branch', branch);
  }
  args.push(...repoArgs);

  const raw = execGh(args);
  const runs = JSON.parse(raw);
  return runs.filter((run) => run.conclusion && run.conclusion.toLowerCase() !== 'success');
}

function fetchJobsForRun(repo, runId) {
  const path = `repos/${repo}/actions/runs/${runId}/jobs?per_page=100`;
  const raw = execGh(['api', path]);
  const parsed = JSON.parse(raw);
  return parsed.jobs ?? [];
}

function fetchFailedLogs(runId, repoArgs, maxLogLines) {
  try {
    const logOutput = execGh(['run', 'view', String(runId), '--log-failed', ...repoArgs], { trim: false });
    const normalized = logOutput.replace(/\r\n/g, '\n').trimEnd();
    if (!normalized) {
      return '(No failed log lines were returned.)';
    }
    const lines = normalized.split('\n');
    if (lines.length <= maxLogLines) {
      return normalized;
    }
    const tail = lines.slice(-maxLogLines);
    return `... (truncated to last ${maxLogLines} lines)\n` + tail.join('\n');
  } catch (error) {
    return `Unable to load failed logs: ${error.message}`;
  }
}

function printRunHeader(run, repo) {
  console.log(`Workflow: ${run.workflowName ?? 'Unknown'} (#${run.databaseId})`);
  console.log(`Title:    ${run.displayTitle ?? 'n/a'}`);
  console.log(`Branch:   ${run.headBranch ?? 'n/a'}`);
  console.log(`Commit:   ${(run.headSha ?? '').slice(0, 12) || 'n/a'}`);
  console.log(`Status:   ${run.conclusion ?? run.status ?? 'n/a'}`);
  console.log(`URL:      ${run.url ?? `https://github.com/${repo}/actions/runs/${run.databaseId}`}`);
}

function printJobFailures(jobs) {
  if (!jobs.length) {
    console.log('\nJobs: Unable to load job metadata (no jobs returned).');
    return;
  }

  const failingJobs = jobs.filter((job) => (job.conclusion ?? '').toLowerCase() !== 'success');
  if (!failingJobs.length) {
    console.log('\nJobs: All jobs succeeded; failure likely came from an external check.');
    return;
  }

  console.log('\nJobs:');
  failingJobs.forEach((job) => {
    console.log(`  - ${job.name ?? job.id} (${job.conclusion ?? job.status ?? 'unknown'})`);
    if (Array.isArray(job.steps)) {
      job.steps
        .filter((step) => step.conclusion && step.conclusion.toLowerCase() !== 'success')
        .forEach((step) => {
          console.log(`      - ${step.name ?? `step #${step.number}`}: ${step.conclusion}`);
        });
    }
    if (job.html_url) {
      console.log(`      job URL: ${job.html_url}`);
    }
  });
}

function printLogSnippet(logSnippet, maxLogLines) {
  console.log('\nFailed Step Logs:');
  if (!logSnippet) {
    console.log('  (No log output available)');
    return;
  }
  const lines = logSnippet.split('\n');
  lines.forEach((line) => {
    console.log(`  ${line}`);
  });
  if (!logSnippet.startsWith('... (truncated') && lines.length > maxLogLines) {
    console.log(`  ... (display limited to ${maxLogLines} lines)`);
  }
}

function execGh(args, { trim = true } = {}) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.error) {
    throw new Error(result.error.message);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(stderr || `Command failed: gh ${args.join(' ')}`);
  }
  return trim ? result.stdout.trim() : result.stdout;
}
