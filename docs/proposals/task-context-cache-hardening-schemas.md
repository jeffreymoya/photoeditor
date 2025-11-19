# Task Context Cache Hardening: Schema Specifications

**Status**: Specification Appendix
**Parent Proposal**: `docs/proposals/task-context-cache-hardening.md`
**Date**: 2025-11-16
**Purpose**: Provide precise schema definitions, validation rules, and error codes for all components referenced in the hardening proposal.

---

## Table of Contents

1. [Evidence Attachment Schema](#1-evidence-attachment-schema)
2. [Validation Command Schema](#2-validation-command-schema)
3. [Exception Ledger Schema](#3-exception-ledger-schema)
4. [QA Artifact Schema](#4-qa-artifact-schema)
5. [Telemetry Schema](#5-telemetry-schema)
6. [Error Codes Reference](#6-error-codes-reference)
7. [Standards Excerpt Hashing](#7-standards-excerpt-hashing)
8. [Acceptance Criteria Validation](#8-acceptance-criteria-validation)
9. [Cache Quarantine Mechanism](#9-cache-quarantine-mechanism)
10. [Metrics Collection Schema](#10-metrics-collection-schema)

---

## 1. Evidence Attachment Schema

### 1.1 Core Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "type", "path", "sha256", "created_at"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^[a-f0-9]{16}$",
      "description": "16-char SHA256 prefix of content"
    },
    "type": {
      "type": "string",
      "enum": ["file", "directory", "archive", "log", "screenshot", "qa_output", "summary", "diff"],
      "description": "Artifact type for validation and display"
    },
    "path": {
      "type": "string",
      "description": "Relative path from repo root"
    },
    "sha256": {
      "type": "string",
      "pattern": "^[a-f0-9]{64}$",
      "description": "Full SHA256 hash of content"
    },
    "size": {
      "type": "integer",
      "minimum": 0,
      "description": "Size in bytes"
    },
    "created_at": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp"
    },
    "description": {
      "type": "string",
      "maxLength": 200,
      "description": "Human-readable description"
    },
    "compression": {
      "type": "object",
      "description": "Present only for type=archive",
      "properties": {
        "format": {
          "type": "string",
          "enum": ["tar.zst", "tar.gz"]
        },
        "original_size": {
          "type": "integer"
        },
        "index_path": {
          "type": "string",
          "description": "Path to index.json listing archive contents"
        }
      }
    },
    "metadata": {
      "type": "object",
      "description": "Type-specific metadata",
      "properties": {
        "command": {
          "type": "string",
          "description": "For qa_output: command that generated this"
        },
        "exit_code": {
          "type": "integer",
          "description": "For qa_output: command exit code"
        },
        "duration_ms": {
          "type": "integer",
          "description": "For qa_output: execution time"
        }
      }
    }
  }
}
```

### 1.2 Validation Rules

| Type | Max Size | Required Metadata | Compression Required |
|------|----------|-------------------|---------------------|
| `file` | 1 MB | none | no |
| `directory` | N/A | none | yes (must convert to archive) |
| `archive` | 50 MB | compression.format, compression.index_path | yes |
| `log` | 10 MB | command, exit_code (if from command) | no (optional for >1MB) |
| `screenshot` | 5 MB | none | no |
| `qa_output` | 10 MB | command, exit_code, duration_ms | no |
| `summary` | 500 KB | none | no |
| `diff` | 10 MB | none | no (optional for >1MB) |

### 1.3 Directory Archive Format

When `type=directory`, the artifact MUST be compressed:

```python
def create_directory_archive(directory_path: Path, output_path: Path) -> dict:
    """
    Create deterministic archive from directory.

    Returns evidence attachment metadata dict.
    """
    # 1. Create index of contents
    index = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "root": str(directory_path),
        "files": []
    }

    for file_path in sorted(directory_path.rglob("*")):
        if file_path.is_file():
            rel_path = file_path.relative_to(directory_path)
            index["files"].append({
                "path": str(rel_path),
                "size": file_path.stat().st_size,
                "sha256": hashlib.sha256(file_path.read_bytes()).hexdigest()
            })

    # 2. Save index
    index_path = output_path.with_suffix('.index.json')
    index_path.write_text(json.dumps(index, indent=2, sort_keys=True))

    # 3. Create archive (tar.zst for best compression)
    subprocess.run([
        'tar',
        '--zstd',
        '--create',
        '--file', str(output_path),
        '--directory', str(directory_path.parent),
        directory_path.name
    ], check=True)

    # 4. Return metadata
    archive_bytes = output_path.read_bytes()
    return {
        "type": "archive",
        "path": str(output_path.relative_to(repo_root)),
        "sha256": hashlib.sha256(archive_bytes).hexdigest(),
        "size": len(archive_bytes),
        "compression": {
            "format": "tar.zst",
            "original_size": sum(f["size"] for f in index["files"]),
            "index_path": str(index_path.relative_to(repo_root))
        }
    }
```

### 1.4 CLI Integration

```bash
# Attach evidence during task work
python scripts/tasks.py --attach-evidence TASK-0824 \
  --type qa_output \
  --path .agent-output/TASK-0824/qa-static.log \
  --description "Static analysis output from implementer" \
  --metadata '{"command": "pnpm turbo run qa:static", "exit_code": 0, "duration_ms": 4523}'

# Query attached evidence
python scripts/tasks.py --list-evidence TASK-0824 --format json
```

---

## 2. Validation Command Schema

### 2.1 Core Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "command", "description"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^val-[0-9]{3}$",
      "description": "Unique validation command ID (e.g., val-001)"
    },
    "command": {
      "type": "string",
      "description": "Shell command to execute"
    },
    "description": {
      "type": "string",
      "maxLength": 200,
      "description": "Human-readable purpose"
    },
    "cwd": {
      "type": "string",
      "default": ".",
      "description": "Working directory relative to repo root"
    },
    "package": {
      "type": "string",
      "description": "Package scope for turbo commands (e.g., @photoeditor/backend)"
    },
    "env": {
      "type": "object",
      "additionalProperties": {"type": "string"},
      "description": "Environment variables to export before execution"
    },
    "expected_paths": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Paths that must exist before command runs (glob patterns supported)"
    },
    "blocker_id": {
      "type": "string",
      "pattern": "^TASK-[0-9]{4}$",
      "description": "Task ID blocking this validation (skip if open)"
    },
    "timeout_ms": {
      "type": "integer",
      "default": 120000,
      "minimum": 1000,
      "maximum": 600000,
      "description": "Command timeout in milliseconds"
    },
    "retry_policy": {
      "type": "object",
      "properties": {
        "max_attempts": {
          "type": "integer",
          "default": 1,
          "minimum": 1,
          "maximum": 5
        },
        "backoff_ms": {
          "type": "integer",
          "default": 1000
        }
      }
    },
    "criticality": {
      "type": "string",
      "enum": ["required", "recommended", "optional"],
      "default": "required",
      "description": "Failure impact on task validation"
    },
    "expected_exit_codes": {
      "type": "array",
      "items": {"type": "integer"},
      "default": [0],
      "description": "Exit codes considered success"
    }
  }
}
```

### 2.2 Validation Algorithm

```python
def validate_and_execute_command(cmd: dict, task_id: str) -> dict:
    """
    Execute validation command with pre-flight checks.

    Returns: {success: bool, exit_code: int, stdout: str, stderr: str,
              skipped: bool, skip_reason: str}
    """
    # 1. Check if blocked
    if cmd.get("blocker_id"):
        blocker_task = load_task(cmd["blocker_id"])
        if blocker_task.status != "completed":
            return {
                "success": False,
                "skipped": True,
                "skip_reason": f"Blocked by {cmd['blocker_id']} (status: {blocker_task.status})",
                "exit_code": None
            }

    # 2. Verify expected paths exist
    repo_root = get_repo_root()
    for pattern in cmd.get("expected_paths", []):
        matches = list(repo_root.glob(pattern))
        if not matches:
            return {
                "success": False,
                "skipped": True,
                "skip_reason": f"Expected path not found: {pattern}",
                "exit_code": None
            }

    # 3. Prepare environment
    env = os.environ.copy()
    env.update(cmd.get("env", {}))

    # 4. Change to working directory
    cwd = repo_root / cmd.get("cwd", ".")
    if not cwd.exists():
        return {
            "success": False,
            "skipped": True,
            "skip_reason": f"Working directory does not exist: {cwd}",
            "exit_code": None
        }

    # 5. Execute with retry policy
    retry_policy = cmd.get("retry_policy", {"max_attempts": 1})
    for attempt in range(retry_policy["max_attempts"]):
        try:
            result = subprocess.run(
                cmd["command"],
                shell=True,
                cwd=cwd,
                env=env,
                capture_output=True,
                text=True,
                timeout=cmd.get("timeout_ms", 120000) / 1000
            )

            expected_codes = cmd.get("expected_exit_codes", [0])
            success = result.returncode in expected_codes

            return {
                "success": success,
                "exit_code": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "skipped": False,
                "attempts": attempt + 1
            }

        except subprocess.TimeoutExpired:
            if attempt < retry_policy["max_attempts"] - 1:
                time.sleep(retry_policy.get("backoff_ms", 1000) / 1000)
                continue
            return {
                "success": False,
                "exit_code": -1,
                "stderr": f"Command timed out after {cmd['timeout_ms']}ms",
                "skipped": False,
                "timeout": True
            }
```

### 2.3 Example Validation Commands

```yaml
# In task YAML validation.pipeline
validation:
  pipeline:
    - id: val-001
      command: pnpm turbo run lint:fix --filter=@photoeditor/backend
      description: Auto-fix linting issues in backend package
      package: "@photoeditor/backend"
      cwd: "."
      expected_paths:
        - "backend/package.json"
        - "turbo.json"
      timeout_ms: 60000
      criticality: required

    - id: val-002
      command: pnpm turbo run qa:static --filter=@photoeditor/backend
      description: Run static analysis on backend
      package: "@photoeditor/backend"
      env:
        NODE_ENV: test
      expected_paths:
        - "backend/eslint.config.js"
        - "backend/tsconfig.json"
      timeout_ms: 120000
      criticality: required

    - id: val-003
      command: node scripts/ci/check-domain-purity.mjs --output /tmp/domain-purity.json
      description: Verify domain layer purity
      cwd: "."
      expected_paths:
        - "scripts/ci/check-domain-purity.mjs"
      blocker_id: null
      criticality: required
```

---

## 3. Exception Ledger Schema

### 3.1 Core Schema

Location: `docs/compliance/context-cache-exceptions.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "last_updated", "exceptions"],
  "properties": {
    "version": {
      "type": "string",
      "const": "1.0",
      "description": "Schema version"
    },
    "last_updated": {
      "type": "string",
      "format": "date-time"
    },
    "exceptions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["task_id", "exception_type", "detected_at", "remediation"],
        "properties": {
          "task_id": {
            "type": "string",
            "pattern": "^TASK-[0-9]{4}$"
          },
          "exception_type": {
            "type": "string",
            "enum": ["malformed_yaml", "missing_standards", "empty_acceptance_criteria", "invalid_schema"]
          },
          "detected_at": {
            "type": "string",
            "format": "date-time"
          },
          "parse_error": {
            "type": "string",
            "description": "Detailed error message from parser"
          },
          "suppressed_warnings": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Warning messages suppressed for this task"
          },
          "remediation": {
            "type": "object",
            "required": ["owner", "status"],
            "properties": {
              "owner": {
                "type": "string",
                "description": "GitHub username or 'system'"
              },
              "status": {
                "type": "string",
                "enum": ["open", "in_progress", "resolved", "wont_fix"]
              },
              "deadline": {
                "type": "string",
                "format": "date",
                "description": "Target resolution date"
              },
              "notes": {
                "type": "string"
              },
              "resolved_at": {
                "type": "string",
                "format": "date-time"
              }
            }
          },
          "auto_remove_on": {
            "type": "string",
            "enum": ["task_completion", "task_deletion", "manual"],
            "default": "task_completion",
            "description": "When to automatically remove this exception"
          }
        }
      }
    }
  }
}
```

### 3.2 Update Workflow

```python
def add_exception(task_id: str, exception_type: str, parse_error: str) -> None:
    """
    Add exception to ledger (idempotent - won't duplicate).
    """
    ledger_path = Path("docs/compliance/context-cache-exceptions.json")
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {
        "version": "1.0",
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "exceptions": []
    }

    # Check if exception already exists
    existing = next((e for e in ledger["exceptions"] if e["task_id"] == task_id), None)
    if existing:
        # Update existing entry
        existing["detected_at"] = datetime.now(timezone.utc).isoformat()
        existing["parse_error"] = parse_error
    else:
        # Add new entry
        ledger["exceptions"].append({
            "task_id": task_id,
            "exception_type": exception_type,
            "detected_at": datetime.now(timezone.utc).isoformat(),
            "parse_error": parse_error,
            "suppressed_warnings": [],
            "remediation": {
                "owner": "system",
                "status": "open",
                "deadline": (datetime.now() + timedelta(days=30)).date().isoformat()
            },
            "auto_remove_on": "task_completion"
        })

    ledger["last_updated"] = datetime.now(timezone.utc).isoformat()
    ledger_path.write_text(json.dumps(ledger, indent=2, sort_keys=True))


def should_suppress_warnings(task_id: str) -> bool:
    """Check if warnings should be suppressed for task."""
    ledger_path = Path("docs/compliance/context-cache-exceptions.json")
    if not ledger_path.exists():
        return False

    ledger = json.loads(ledger_path.read_text())
    exception = next((e for e in ledger["exceptions"] if e["task_id"] == task_id), None)
    return exception is not None


def cleanup_exception(task_id: str, trigger: str) -> None:
    """Remove exception when trigger condition met."""
    ledger_path = Path("docs/compliance/context-cache-exceptions.json")
    if not ledger_path.exists():
        return

    ledger = json.loads(ledger_path.read_text())
    ledger["exceptions"] = [
        e for e in ledger["exceptions"]
        if not (e["task_id"] == task_id and e["auto_remove_on"] == trigger)
    ]
    ledger["last_updated"] = datetime.now(timezone.utc).isoformat()
    ledger_path.write_text(json.dumps(ledger, indent=2, sort_keys=True))
```

### 3.3 CLI Integration

```bash
# Add exception manually
python scripts/tasks.py --add-exception TASK-0824 \
  --type malformed_yaml \
  --error "Invalid YAML: unexpected character at line 42"

# List exceptions
python scripts/tasks.py --list-exceptions --format json

# Resolve exception
python scripts/tasks.py --resolve-exception TASK-0824 \
  --notes "Fixed YAML indentation in commit abc123"

# Clean up completed tasks
python scripts/tasks.py --cleanup-exceptions --trigger task_completion
```

---

## 4. QA Artifact Schema

### 4.1 Enhanced validation_baseline.initial_results

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["recorded_at", "agent", "results"],
  "properties": {
    "recorded_at": {
      "type": "string",
      "format": "date-time"
    },
    "agent": {
      "type": "string",
      "enum": ["implementer", "reviewer", "validator"]
    },
    "git_sha": {
      "type": "string",
      "pattern": "^[a-f0-9]{40}$",
      "description": "Git commit SHA when QA ran"
    },
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["command_id", "command", "exit_code", "duration_ms"],
        "properties": {
          "command_id": {
            "type": "string",
            "description": "Matches validation command ID"
          },
          "command": {
            "type": "string"
          },
          "exit_code": {
            "type": "integer"
          },
          "duration_ms": {
            "type": "integer"
          },
          "log_path": {
            "type": "string",
            "description": "Path to full log file"
          },
          "log_sha256": {
            "type": "string",
            "pattern": "^[a-f0-9]{64}$"
          },
          "summary": {
            "type": "object",
            "description": "Parsed summary (type-specific)",
            "properties": {
              "lint_errors": {"type": "integer"},
              "lint_warnings": {"type": "integer"},
              "type_errors": {"type": "integer"},
              "tests_passed": {"type": "integer"},
              "tests_failed": {"type": "integer"},
              "coverage": {
                "type": "object",
                "properties": {
                  "lines": {"type": "number"},
                  "branches": {"type": "number"},
                  "functions": {"type": "number"},
                  "statements": {"type": "number"}
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### 4.2 Log Parsing Format

```python
def parse_qa_log(log_path: Path, command_type: str) -> dict:
    """
    Parse QA log file into structured summary.

    Args:
        log_path: Path to log file
        command_type: One of 'lint', 'typecheck', 'test', 'coverage'

    Returns:
        Structured summary dict
    """
    log_content = log_path.read_text()

    if command_type == 'lint':
        # Parse ESLint output
        errors = len(re.findall(r'✖\s+\d+\s+error', log_content))
        warnings = len(re.findall(r'⚠\s+\d+\s+warning', log_content))
        return {
            "lint_errors": errors,
            "lint_warnings": warnings
        }

    elif command_type == 'typecheck':
        # Parse tsc output
        errors = len(re.findall(r'error TS\d+:', log_content))
        return {
            "type_errors": errors
        }

    elif command_type == 'test':
        # Parse Jest output
        passed_match = re.search(r'Tests:\s+(\d+)\s+passed', log_content)
        failed_match = re.search(r'(\d+)\s+failed', log_content)
        return {
            "tests_passed": int(passed_match.group(1)) if passed_match else 0,
            "tests_failed": int(failed_match.group(1)) if failed_match else 0
        }

    elif command_type == 'coverage':
        # Parse Jest coverage output
        coverage = {}
        for metric in ['lines', 'branches', 'functions', 'statements']:
            match = re.search(rf'{metric}\s*:\s*([\d.]+)%', log_content, re.IGNORECASE)
            if match:
                coverage[metric] = float(match.group(1))
        return {"coverage": coverage}

    return {}
```

### 4.3 Drift Detection

```python
def detect_qa_drift(baseline: dict, current: dict) -> dict:
    """
    Compare current QA results to baseline.

    Returns:
        {has_drift: bool, regressions: [], improvements: []}
    """
    regressions = []
    improvements = []

    baseline_results = {r["command_id"]: r for r in baseline["results"]}
    current_results = {r["command_id"]: r for r in current["results"]}

    for cmd_id, current_result in current_results.items():
        baseline_result = baseline_results.get(cmd_id)
        if not baseline_result:
            continue

        # Compare exit codes
        if baseline_result["exit_code"] == 0 and current_result["exit_code"] != 0:
            regressions.append({
                "command_id": cmd_id,
                "type": "exit_code_regression",
                "baseline": 0,
                "current": current_result["exit_code"]
            })

        # Compare summaries
        if "summary" in baseline_result and "summary" in current_result:
            baseline_summary = baseline_result["summary"]
            current_summary = current_result["summary"]

            # Check for new lint/type errors
            if baseline_summary.get("lint_errors", 0) < current_summary.get("lint_errors", 0):
                regressions.append({
                    "command_id": cmd_id,
                    "type": "lint_errors_increased",
                    "baseline": baseline_summary["lint_errors"],
                    "current": current_summary["lint_errors"]
                })

            # Check coverage regression
            if "coverage" in baseline_summary and "coverage" in current_summary:
                for metric in ["lines", "branches"]:
                    baseline_val = baseline_summary["coverage"].get(metric, 0)
                    current_val = current_summary["coverage"].get(metric, 0)
                    if current_val < baseline_val - 1.0:  # >1% drop
                        regressions.append({
                            "command_id": cmd_id,
                            "type": f"coverage_{metric}_dropped",
                            "baseline": baseline_val,
                            "current": current_val
                        })

    return {
        "has_drift": len(regressions) > 0,
        "regressions": regressions,
        "improvements": improvements
    }
```

---

## 5. Telemetry Schema

### 5.1 Core Schema

Location: `.agent-output/TASK-XXXX/telemetry-{agent}.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["task_id", "agent_role", "session_start", "session_end", "metrics"],
  "properties": {
    "task_id": {
      "type": "string",
      "pattern": "^TASK-[0-9]{4}$"
    },
    "agent_role": {
      "type": "string",
      "enum": ["implementer", "reviewer", "validator", "task-runner"]
    },
    "session_start": {
      "type": "string",
      "format": "date-time"
    },
    "session_end": {
      "type": "string",
      "format": "date-time"
    },
    "duration_ms": {
      "type": "integer",
      "description": "Total session duration"
    },
    "metrics": {
      "type": "object",
      "required": ["file_operations", "cache_operations", "commands_executed"],
      "properties": {
        "file_operations": {
          "type": "object",
          "properties": {
            "read_calls": {
              "type": "integer",
              "description": "Number of Read() tool invocations"
            },
            "write_calls": {
              "type": "integer"
            },
            "edit_calls": {
              "type": "integer"
            },
            "files_read": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "path": {"type": "string"},
                  "size": {"type": "integer"},
                  "read_count": {"type": "integer"}
                }
              }
            }
          }
        },
        "cache_operations": {
          "type": "object",
          "properties": {
            "context_reads": {
              "type": "integer",
              "description": "Number of --get-context calls"
            },
            "cache_hits": {
              "type": "integer",
              "description": "Data found in cache"
            },
            "cache_misses": {
              "type": "integer",
              "description": "Data not in cache, required file read"
            },
            "token_savings_estimate": {
              "type": "integer",
              "description": "Estimated tokens saved vs uploading files"
            }
          }
        },
        "commands_executed": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "command": {"type": "string"},
              "exit_code": {"type": "integer"},
              "duration_ms": {"type": "integer"}
            }
          }
        }
      }
    },
    "warnings": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "timestamp": {"type": "string", "format": "date-time"},
          "level": {"type": "string", "enum": ["warning", "error"]},
          "message": {"type": "string"}
        }
      }
    }
  }
}
```

### 5.2 Collection Mechanism

```python
class TelemetryCollector:
    """Context manager for collecting agent telemetry."""

    def __init__(self, task_id: str, agent_role: str):
        self.task_id = task_id
        self.agent_role = agent_role
        self.session_start = datetime.now(timezone.utc)
        self.metrics = {
            "file_operations": {
                "read_calls": 0,
                "write_calls": 0,
                "edit_calls": 0,
                "files_read": []
            },
            "cache_operations": {
                "context_reads": 0,
                "cache_hits": 0,
                "cache_misses": 0,
                "token_savings_estimate": 0
            },
            "commands_executed": []
        }
        self.warnings = []

    def record_file_read(self, path: str, size: int):
        """Record a file read operation."""
        self.metrics["file_operations"]["read_calls"] += 1

        # Track unique files
        existing = next(
            (f for f in self.metrics["file_operations"]["files_read"] if f["path"] == path),
            None
        )
        if existing:
            existing["read_count"] += 1
        else:
            self.metrics["file_operations"]["files_read"].append({
                "path": path,
                "size": size,
                "read_count": 1
            })

    def record_cache_hit(self, data_type: str, size_bytes: int):
        """Record a cache hit (data found without file read)."""
        self.metrics["cache_operations"]["cache_hits"] += 1
        # Estimate tokens saved (rough: 1 token ≈ 4 chars ≈ 4 bytes)
        tokens_saved = size_bytes // 4
        self.metrics["cache_operations"]["token_savings_estimate"] += tokens_saved

    def record_command(self, command: str, exit_code: int, duration_ms: int):
        """Record command execution."""
        self.metrics["commands_executed"].append({
            "command": command,
            "exit_code": exit_code,
            "duration_ms": duration_ms
        })

    def add_warning(self, message: str, level: str = "warning"):
        """Add a warning or error."""
        self.warnings.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "message": message
        })

    def save(self):
        """Save telemetry to file."""
        output_dir = Path(f".agent-output/{self.task_id}")
        output_dir.mkdir(parents=True, exist_ok=True)

        output_path = output_dir / f"telemetry-{self.agent_role}.json"

        telemetry = {
            "task_id": self.task_id,
            "agent_role": self.agent_role,
            "session_start": self.session_start.isoformat(),
            "session_end": datetime.now(timezone.utc).isoformat(),
            "duration_ms": int((datetime.now(timezone.utc) - self.session_start).total_seconds() * 1000),
            "metrics": self.metrics,
            "warnings": self.warnings
        }

        output_path.write_text(json.dumps(telemetry, indent=2, sort_keys=True))
        return output_path
```

### 5.3 Aggregation Format

```python
def aggregate_telemetry(task_id: str) -> dict:
    """
    Aggregate telemetry across all agents for a task.

    Returns summary with totals and per-agent breakdown.
    """
    telemetry_dir = Path(f".agent-output/{task_id}")
    telemetry_files = list(telemetry_dir.glob("telemetry-*.json"))

    aggregate = {
        "task_id": task_id,
        "total_duration_ms": 0,
        "total_file_reads": 0,
        "total_cache_hits": 0,
        "total_token_savings": 0,
        "by_agent": {}
    }

    for file_path in telemetry_files:
        data = json.loads(file_path.read_text())
        agent = data["agent_role"]

        aggregate["total_duration_ms"] += data["duration_ms"]
        aggregate["total_file_reads"] += data["metrics"]["file_operations"]["read_calls"]
        aggregate["total_cache_hits"] += data["metrics"]["cache_operations"]["cache_hits"]
        aggregate["total_token_savings"] += data["metrics"]["cache_operations"]["token_savings_estimate"]

        aggregate["by_agent"][agent] = {
            "duration_ms": data["duration_ms"],
            "file_reads": data["metrics"]["file_operations"]["read_calls"],
            "cache_hits": data["metrics"]["cache_operations"]["cache_hits"],
            "warnings_count": len(data["warnings"])
        }

    return aggregate
```

---

## 6. Error Codes Reference

### 6.1 Exit Code Ranges

| Range | Category | Description |
|-------|----------|-------------|
| 0 | Success | Operation completed successfully |
| 1-9 | Generic Errors | Catch-all for unspecified failures |
| 10-19 | Validation Errors | Schema validation, missing fields, invalid data |
| 20-29 | Drift Errors | Working tree drift, cache staleness |
| 30-39 | Blocker Errors | Task blocked, dependency not met |
| 40-49 | I/O Errors | File not found, permission denied |
| 50-59 | Context Errors | Context exists, not found, corrupted |
| 60-69 | Git Errors | Git operations failed |

### 6.2 Detailed Error Codes

| Code | Name | Message Template | Recovery Action |
|------|------|------------------|-----------------|
| E001 | VALIDATION_EMPTY_FIELD | "Required field '{field}' is empty in {file}" | Add content to field |
| E002 | VALIDATION_INVALID_TYPE | "Field '{field}' has invalid type: expected {expected}, got {actual}" | Fix field type |
| E003 | VALIDATION_MISSING_REFERENCE | "Referenced {type} '{id}' not found" | Create referenced item or remove reference |
| E010 | SCHEMA_VALIDATION_FAILED | "Schema validation failed: {details}" | Fix schema errors |
| E011 | MALFORMED_YAML | "YAML parse error in {file}: {error}" | Fix YAML syntax |
| E020 | DRIFT_FILE_MODIFIED | "File '{path}' modified outside agent workflow (expected SHA: {expected}, current: {actual})" | Revert changes or re-snapshot |
| E021 | DRIFT_BASE_COMMIT_CHANGED | "Base commit changed (expected: {expected}, current: {actual})" | Re-initialize context |
| E022 | DRIFT_UNEXPECTED_CLEAN | "Working tree is clean but dirty expected" | Commit was made prematurely |
| E030 | BLOCKED_BY_TASK | "Task blocked by {task_id} (status: {status})" | Complete blocker task |
| E031 | BLOCKED_BY_VALIDATION | "Validation command '{command}' blocked by {blocker_id}" | Resolve blocker |
| E040 | FILE_NOT_FOUND | "File not found: {path}" | Create missing file |
| E041 | PERMISSION_DENIED | "Permission denied: {path}" | Fix file permissions |
| E050 | CONTEXT_EXISTS | "Context already initialized for {task_id}" | Use --rebuild-context or --purge-context |
| E051 | CONTEXT_NOT_FOUND | "No context found for {task_id}" | Run --init-context |
| E052 | CONTEXT_CORRUPTED | "Context file corrupted: {details}" | Re-initialize context |
| E060 | GIT_DIRTY_TREE | "Working tree has uncommitted changes" | Commit or stash changes |
| E061 | GIT_COMMAND_FAILED | "Git command failed: {command}" | Check git status |

### 6.3 JSON Error Format

```json
{
  "success": false,
  "error": {
    "code": "E020",
    "name": "DRIFT_FILE_MODIFIED",
    "message": "File 'mobile/src/App.tsx' modified outside agent workflow",
    "details": {
      "path": "mobile/src/App.tsx",
      "expected_sha": "abc123...",
      "current_sha": "def456...",
      "agent": "reviewer",
      "snapshot_time": "2025-11-16T10:30:00Z"
    },
    "recovery_action": "Revert changes or re-snapshot working tree",
    "documentation": "https://docs/troubleshooting.md#drift-detected"
  }
}
```

### 6.4 CLI Usage

```bash
# Commands exit with appropriate code
python scripts/tasks.py --verify-worktree TASK-0824 --expected-agent reviewer
# Exit code 20 if drift detected

# Check exit code in scripts
if ! python scripts/tasks.py --verify-worktree TASK-0824 --expected-agent reviewer; then
  case $? in
    20) echo "Drift detected" ;;
    30) echo "Task blocked" ;;
    50) echo "Context not found" ;;
    *) echo "Unknown error" ;;
  esac
fi

# JSON output includes error code
python scripts/tasks.py --verify-worktree TASK-0824 --format json
# {"success": false, "error": {"code": "E020", ...}}
```

---

## 7. Standards Excerpt Hashing

### 7.1 Excerpt Extraction Algorithm

```python
def extract_standards_excerpt(
    standards_file: Path,
    section_heading: str,
    repo_root: Path
) -> dict:
    """
    Extract a standards section with deterministic hashing.

    Args:
        standards_file: Path to standards markdown file
        section_heading: Heading text (e.g., "Handler Constraints")
        repo_root: Repository root for relative paths

    Returns:
        {
            "file": "standards/backend-tier.md",
            "section": "handler-constraints",
            "requirement": "First sentence summary...",
            "line_span": "L42-L89",
            "content_sha": "a3f5b8c9d2e1f4a6",
            "excerpt_id": "a3f5b8c9"
        }
    """
    content = standards_file.read_text()
    lines = content.split('\n')

    # Find section boundaries
    section_start = None
    section_end = None
    current_level = None

    for i, line in enumerate(lines):
        # Match markdown headings
        heading_match = re.match(r'^(#{1,6})\s+(.+)$', line)
        if not heading_match:
            continue

        level = len(heading_match.group(1))
        heading_text = heading_match.group(2).strip()

        # Normalize heading for comparison
        normalized = heading_text.lower().replace(' ', '-').replace('&', 'and')
        section_slug = section_heading.lower().replace(' ', '-').replace('&', 'and')

        if normalized == section_slug and section_start is None:
            section_start = i
            current_level = level
        elif section_start is not None and level <= current_level:
            section_end = i
            break

    if section_start is None:
        raise ValueError(f"Section '{section_heading}' not found in {standards_file}")

    if section_end is None:
        section_end = len(lines)

    # Extract section content (EXCLUDING the heading line)
    section_lines = lines[section_start + 1:section_end]

    # Remove blank lines at start/end
    while section_lines and not section_lines[0].strip():
        section_lines.pop(0)
        section_start += 1
    while section_lines and not section_lines[-1].strip():
        section_lines.pop()
        section_end -= 1

    # Join with newlines and ensure trailing newline
    excerpt_content = '\n'.join(section_lines)
    if excerpt_content and not excerpt_content.endswith('\n'):
        excerpt_content += '\n'

    # Calculate hash
    content_sha = hashlib.sha256(excerpt_content.encode('utf-8')).hexdigest()
    excerpt_id = content_sha[:8]  # 8-char prefix for ID

    # Extract first sentence as requirement summary
    first_paragraph = excerpt_content.split('\n\n')[0]
    first_sentence = first_paragraph.split('. ')[0] + '.'
    requirement = first_sentence[:140]  # Truncate to 140 chars

    return {
        "file": str(standards_file.relative_to(repo_root)),
        "section": section_heading.lower().replace(' ', '-'),
        "requirement": requirement,
        "line_span": f"L{section_start + 2}-L{section_end}",  # +2 to skip heading
        "content_sha": content_sha[:16],  # 16-char prefix
        "excerpt_id": excerpt_id
    }
```

### 7.2 Excerpt Caching

Excerpts are cached in `.agent-output/TASK-XXXX/evidence/standards/`:

```
.agent-output/TASK-0824/evidence/standards/
  a3f5b8c9-backend-tier-handler-constraints.md
  b7e2c4d1-typescript-strict-config.md
  index.json
```

`index.json`:
```json
{
  "excerpts": [
    {
      "id": "a3f5b8c9",
      "file": "standards/backend-tier.md",
      "section": "handler-constraints",
      "content_sha": "a3f5b8c9d2e1f4a6",
      "cached_at": "2025-11-16T10:00:00Z",
      "excerpt_path": "a3f5b8c9-backend-tier-handler-constraints.md"
    }
  ]
}
```

### 7.3 Cache Invalidation

```python
def verify_excerpt_freshness(excerpt: dict, repo_root: Path) -> bool:
    """
    Verify cached excerpt matches current standards file.

    Returns True if fresh, False if stale.
    """
    standards_file = repo_root / excerpt["file"]
    if not standards_file.exists():
        return False

    # Re-extract and compare SHA
    current_excerpt = extract_standards_excerpt(
        standards_file,
        excerpt["section"].replace('-', ' ').title(),
        repo_root
    )

    return current_excerpt["content_sha"] == excerpt["content_sha"]


def invalidate_stale_excerpts(task_id: str, repo_root: Path) -> List[str]:
    """
    Check all excerpts for staleness and remove stale ones.

    Returns list of invalidated excerpt IDs.
    """
    evidence_dir = Path(f".agent-output/{task_id}/evidence/standards")
    index_path = evidence_dir / "index.json"

    if not index_path.exists():
        return []

    index = json.loads(index_path.read_text())
    stale_ids = []

    for excerpt in index["excerpts"]:
        if not verify_excerpt_freshness(excerpt, repo_root):
            stale_ids.append(excerpt["id"])
            # Remove cached file
            excerpt_path = evidence_dir / excerpt["excerpt_path"]
            excerpt_path.unlink(missing_ok=True)

    # Update index
    index["excerpts"] = [
        e for e in index["excerpts"]
        if e["id"] not in stale_ids
    ]
    index_path.write_text(json.dumps(index, indent=2, sort_keys=True))

    return stale_ids
```

---

## 8. Acceptance Criteria Validation

### 8.1 Required vs Optional Fields

Based on task breakdown canon and template requirements:

| Field | Status | Empty Array Allowed | Validation Behavior |
|-------|--------|---------------------|---------------------|
| `acceptance_criteria` | REQUIRED-NON-EMPTY | No | Fail with E001 |
| `scope.in` | REQUIRED-NON-EMPTY | No | Fail with E001 |
| `scope.out` | OPTIONAL | Yes | Warn only |
| `plan` | REQUIRED-NON-EMPTY | No | Fail with E001 |
| `deliverables` | REQUIRED-NON-EMPTY | No | Fail with E001 |
| `validation.pipeline` | REQUIRED-NON-EMPTY (schema 1.1+) | No | Fail with E001 |
| `validation.manual_checks` | OPTIONAL | Yes | Default to [] |
| `risks` | OPTIONAL | Yes | Default to [] |
| `blocked_by` | OPTIONAL | Yes | Default to [] |

### 8.2 Validation Function

```python
def validate_task_snapshot_completeness(task_data: dict) -> List[dict]:
    """
    Validate task data completeness for context init.

    Returns list of validation errors (empty if valid).
    """
    errors = []

    # Required non-empty fields
    required_fields = {
        "acceptance_criteria": "Acceptance criteria",
        "scope.in": "Scope (in)",
        "plan": "Implementation plan",
        "deliverables": "Deliverables",
        "validation.pipeline": "Validation pipeline (schema 1.1+)"
    }

    for field_path, field_name in required_fields.items():
        # Navigate nested fields
        value = task_data
        for key in field_path.split('.'):
            value = value.get(key, None)
            if value is None:
                break

        # Check if empty
        if value is None or (isinstance(value, list) and len(value) == 0):
            errors.append({
                "code": "E001",
                "field": field_path,
                "message": f"Required field '{field_name}' is empty",
                "severity": "error"
            })

    # Optional fields with warnings
    if not task_data.get("scope", {}).get("out"):
        errors.append({
            "code": "W001",
            "field": "scope.out",
            "message": "Scope exclusions (out) not specified - consider adding for clarity",
            "severity": "warning"
        })

    # Validate plan step structure
    for i, step in enumerate(task_data.get("plan", [])):
        if not step.get("outputs") or len(step["outputs"]) == 0:
            errors.append({
                "code": "E001",
                "field": f"plan[{i}].outputs",
                "message": f"Plan step {i+1} has empty outputs array (schema 1.1 violation)",
                "severity": "error"
            })

    # Validate standards citations exist
    if not task_data.get("context", {}).get("standards_tier"):
        errors.append({
            "code": "W002",
            "field": "context.standards_tier",
            "message": "No standards tier specified - context may lack grounding",
            "severity": "warning"
        })

    return errors
```

### 8.3 Fallback Behavior

```python
def init_context_with_validation(task_id: str, task_data: dict) -> None:
    """
    Initialize context with validation and appropriate fallback.
    """
    errors = validate_task_snapshot_completeness(task_data)

    # Separate errors from warnings
    error_items = [e for e in errors if e["severity"] == "error"]
    warning_items = [e for e in errors if e["severity"] == "warning"]

    if error_items:
        # Fatal errors - fail initialization
        error_details = '\n'.join(f"  - {e['field']}: {e['message']}" for e in error_items)
        raise ValidationError(
            f"Cannot initialize context for {task_id} due to validation errors:\n{error_details}\n\n"
            f"Fix these issues in the task file before running --init-context."
        )

    if warning_items:
        # Warnings - log but proceed
        warning_details = '\n'.join(f"  - {e['field']}: {e['message']}" for e in warning_items)
        print(f"Warning: Context initialization proceeding with warnings:\n{warning_details}\n",
              file=sys.stderr)

    # Proceed with initialization
    # ... rest of init logic
```

---

## 9. Cache Quarantine Mechanism

### 9.1 Quarantine Directory Structure

```
docs/compliance/quarantine/
  TASK-0201.quarantine.json
  TASK-0305.quarantine.json
  index.json
```

### 9.2 Quarantine Entry Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["task_id", "quarantined_at", "reason", "original_path"],
  "properties": {
    "task_id": {
      "type": "string",
      "pattern": "^TASK-[0-9]{4}$"
    },
    "quarantined_at": {
      "type": "string",
      "format": "date-time"
    },
    "reason": {
      "type": "string",
      "enum": ["malformed_yaml", "validation_failed", "corrupted_context", "manual"]
    },
    "original_path": {
      "type": "string",
      "description": "Original task file path before quarantine"
    },
    "error_details": {
      "type": "string",
      "description": "Detailed error message"
    },
    "auto_repair_attempted": {
      "type": "boolean",
      "default": false
    },
    "repair_status": {
      "type": "string",
      "enum": ["pending", "in_progress", "repaired", "cannot_repair"],
      "default": "pending"
    },
    "repair_notes": {
      "type": "string"
    },
    "resolved_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

### 9.3 Quarantine Workflow

```python
def quarantine_task(task_id: str, reason: str, error_details: str) -> Path:
    """
    Move task to quarantine and record in index.

    Returns path to quarantine entry.
    """
    quarantine_dir = Path("docs/compliance/quarantine")
    quarantine_dir.mkdir(parents=True, exist_ok=True)

    # Create quarantine entry
    entry = {
        "task_id": task_id,
        "quarantined_at": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
        "original_path": f"tasks/{task_id}.task.yaml",  # Inferred
        "error_details": error_details,
        "auto_repair_attempted": False,
        "repair_status": "pending"
    }

    entry_path = quarantine_dir / f"{task_id}.quarantine.json"
    entry_path.write_text(json.dumps(entry, indent=2, sort_keys=True))

    # Update index
    index_path = quarantine_dir / "index.json"
    if index_path.exists():
        index = json.loads(index_path.read_text())
    else:
        index = {"quarantined_tasks": []}

    # Add to index if not already present
    if task_id not in index["quarantined_tasks"]:
        index["quarantined_tasks"].append(task_id)

    index_path.write_text(json.dumps(index, indent=2, sort_keys=True))

    return entry_path


def is_quarantined(task_id: str) -> bool:
    """Check if task is in quarantine."""
    index_path = Path("docs/compliance/quarantine/index.json")
    if not index_path.exists():
        return False

    index = json.loads(index_path.read_text())
    return task_id in index["quarantined_tasks"]


def attempt_auto_repair(task_id: str) -> bool:
    """
    Attempt automatic repair of quarantined task.

    Returns True if repaired, False otherwise.
    """
    entry_path = Path(f"docs/compliance/quarantine/{task_id}.quarantine.json")
    if not entry_path.exists():
        return False

    entry = json.loads(entry_path.read_text())

    if entry["reason"] == "malformed_yaml":
        # Attempt YAML auto-repair (limited scope)
        task_path = Path(entry["original_path"])
        if not task_path.exists():
            return False

        try:
            # Try to parse with lenient parser
            content = task_path.read_text()
            # ... auto-repair logic (e.g., fix indentation, quote strings)
            # This is simplified - real implementation would be more sophisticated

            # If successful, mark as repaired
            entry["auto_repair_attempted"] = True
            entry["repair_status"] = "repaired"
            entry["resolved_at"] = datetime.now(timezone.utc).isoformat()
            entry["repair_notes"] = "Auto-repaired YAML syntax errors"

            entry_path.write_text(json.dumps(entry, indent=2, sort_keys=True))
            return True
        except Exception as e:
            # Repair failed
            entry["auto_repair_attempted"] = True
            entry["repair_status"] = "cannot_repair"
            entry["repair_notes"] = f"Auto-repair failed: {str(e)}"
            entry_path.write_text(json.dumps(entry, indent=2, sort_keys=True))
            return False

    return False


def release_from_quarantine(task_id: str) -> None:
    """
    Release task from quarantine after manual repair.
    """
    quarantine_dir = Path("docs/compliance/quarantine")
    entry_path = quarantine_dir / f"{task_id}.quarantine.json"

    if entry_path.exists():
        # Archive quarantine entry
        archive_dir = quarantine_dir / "resolved"
        archive_dir.mkdir(exist_ok=True)
        entry_path.rename(archive_dir / entry_path.name)

    # Update index
    index_path = quarantine_dir / "index.json"
    if index_path.exists():
        index = json.loads(index_path.read_text())
        index["quarantined_tasks"] = [
            t for t in index["quarantined_tasks"] if t != task_id
        ]
        index_path.write_text(json.dumps(index, indent=2, sort_keys=True))
```

### 9.4 CLI Integration

```bash
# Check quarantine status
python scripts/tasks.py --list-quarantined --format json

# Attempt auto-repair
python scripts/tasks.py --repair-quarantined TASK-0201

# Manually release after repair
python scripts/tasks.py --release-quarantine TASK-0201 \
  --notes "Fixed YAML indentation in commit abc123"
```

---

## 10. Metrics Collection Schema

### 10.1 Task-Level Metrics

Collected at task completion and stored in `.agent-output/TASK-XXXX/metrics-summary.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["task_id", "completed_at", "metrics"],
  "properties": {
    "task_id": {"type": "string"},
    "completed_at": {"type": "string", "format": "date-time"},
    "baseline": {
      "type": "object",
      "description": "Pre-hardening baseline (null for tasks before hardening)",
      "properties": {
        "file_reads_per_agent": {"type": "number"},
        "warnings_per_init": {"type": "integer"},
        "prompt_size_kb": {"type": "number"}
      }
    },
    "metrics": {
      "type": "object",
      "required": ["file_read_reduction", "warning_noise", "qa_artifact_availability"],
      "properties": {
        "file_read_reduction": {
          "type": "object",
          "description": "Target: ≤5 manual Read() per agent (down from 20+)",
          "properties": {
            "implementer_reads": {"type": "integer"},
            "reviewer_reads": {"type": "integer"},
            "validator_reads": {"type": "integer"},
            "target_met": {"type": "boolean"}
          }
        },
        "warning_noise": {
          "type": "object",
          "description": "Target: ≤1 repeated warning per task",
          "properties": {
            "total_warnings": {"type": "integer"},
            "unique_warnings": {"type": "integer"},
            "repeated_warnings": {"type": "integer"},
            "target_met": {"type": "boolean"}
          }
        },
        "qa_artifact_availability": {
          "type": "object",
          "description": "Target: 100% of required QA commands produce attached logs",
          "properties": {
            "required_commands": {"type": "integer"},
            "commands_with_logs": {"type": "integer"},
            "coverage_percent": {"type": "number"},
            "target_met": {"type": "boolean"}
          }
        },
        "prompt_size_savings": {
          "type": "object",
          "description": "Target: ≥15% reduction in implementer prompt size",
          "properties": {
            "baseline_kb": {"type": "number"},
            "current_kb": {"type": "number"},
            "reduction_percent": {"type": "number"},
            "target_met": {"type": "boolean"}
          }
        },
        "json_output_reliability": {
          "type": "object",
          "description": "Target: zero JSON parse failures",
          "properties": {
            "total_json_calls": {"type": "integer"},
            "parse_failures": {"type": "integer"},
            "target_met": {"type": "boolean"}
          }
        }
      }
    }
  }
}
```

### 10.2 Rollup Dashboard Schema

Aggregated metrics across multiple tasks in `docs/evidence/metrics/cache-hardening-dashboard.json`:

```json
{
  "generated_at": "2025-11-16T15:30:00Z",
  "tasks_analyzed": 10,
  "pilot_phase": "P4",
  "aggregate_metrics": {
    "file_read_reduction": {
      "average_reads_per_agent": 4.2,
      "target": 5,
      "tasks_meeting_target": 9,
      "compliance_rate": 0.90
    },
    "warning_noise": {
      "average_unique_warnings": 0.8,
      "average_repeated_warnings": 0.1,
      "target": 1,
      "tasks_meeting_target": 10,
      "compliance_rate": 1.00
    },
    "qa_artifact_availability": {
      "average_coverage": 98.5,
      "target": 100,
      "tasks_meeting_target": 8,
      "compliance_rate": 0.80
    },
    "prompt_size_savings": {
      "average_reduction_percent": 18.3,
      "target": 15,
      "tasks_meeting_target": 7,
      "compliance_rate": 0.70
    },
    "json_output_reliability": {
      "total_calls": 250,
      "parse_failures": 0,
      "reliability_rate": 1.00
    }
  },
  "trend_data": [
    {
      "date": "2025-11-10",
      "file_reads_per_agent": 6.5
    },
    {
      "date": "2025-11-16",
      "file_reads_per_agent": 4.2
    }
  ]
}
```

### 10.3 Collection Commands

```bash
# Collect metrics for single task
python scripts/tasks.py --collect-metrics TASK-0824

# Generate rollup dashboard
python scripts/tasks.py --generate-metrics-dashboard \
  --from 2025-11-01 \
  --to 2025-11-16 \
  --output docs/evidence/metrics/cache-hardening-dashboard.json

# Compare baseline to current
python scripts/tasks.py --compare-metrics \
  --baseline docs/evidence/metrics/baseline-2025-11-01.json \
  --current docs/evidence/metrics/cache-hardening-dashboard.json
```

---

## Appendix: Implementation Checklist

### Pre-Implementation Schema Review

- [ ] All schemas have complete JSON Schema definitions
- [ ] All schemas validated against sample data
- [ ] All error codes documented with recovery actions
- [ ] All CLI commands have --help text and examples
- [ ] All validation functions have unit tests
- [ ] All schemas have migration plan for existing data

### Implementation Completeness

- [ ] Evidence attachment types all supported
- [ ] Validation commands execute with all features
- [ ] Exception ledger CRUD operations work
- [ ] QA artifacts parsed correctly for all command types
- [ ] Telemetry collected for all agent operations
- [ ] Error codes returned correctly from all CLI commands
- [ ] Standards excerpts cached and invalidated correctly
- [ ] Acceptance criteria validation blocks invalid tasks
- [ ] Quarantine mechanism isolates broken tasks
- [ ] Metrics dashboards generated and comparable

### Pilot Validation

- [ ] Run pilot on 2 tasks
- [ ] Measure all 5 success metrics (Section 6 of main proposal)
- [ ] Compare to baseline (file reads, warnings, artifacts, prompt size, JSON reliability)
- [ ] Document gaps in pilot report
- [ ] Update schemas based on pilot findings
- [ ] Get maintainer approval before GA rollout

---

**Document Status**: Ready for Implementation
**Last Updated**: 2025-11-16
**Maintainer**: Repository Owner
