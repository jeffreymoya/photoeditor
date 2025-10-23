#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const defaultLogsPath = path.join(repoRoot, 'docs', 'evidence', 'logs', 'powertools-sample.json');
const defaultOutputPath = path.join(repoRoot, 'docs', 'evidence', 'trace-drill-report.json');
const requiredFields = ['correlationId', 'traceId', 'requestId', 'function', 'env', 'version'];
const optionalFields = ['jobId', 'userId'];
const defaultThreshold = 0.95;

function parseArgs(argv) {
  const options = {
    logsPath: defaultLogsPath,
    outputPath: defaultOutputPath,
    threshold: defaultThreshold,
    verbose: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--logs' || arg === '-l') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value after --logs');
      }
      options.logsPath = path.resolve(process.cwd(), value);
      i += 1;
    } else if (arg.startsWith('--logs=')) {
      options.logsPath = path.resolve(process.cwd(), arg.split('=')[1]);
    } else if (arg === '--output' || arg === '-o') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value after --output');
      }
      options.outputPath = path.resolve(process.cwd(), value);
      i += 1;
    } else if (arg.startsWith('--output=')) {
      options.outputPath = path.resolve(process.cwd(), arg.split('=')[1]);
    } else if (arg === '--threshold') {
      const value = Number(argv[i + 1]);
      if (Number.isNaN(value)) {
        throw new Error('Threshold must be numeric');
      }
      options.threshold = value;
      i += 1;
    } else if (arg.startsWith('--threshold=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isNaN(value)) {
        throw new Error('Threshold must be numeric');
      }
      options.threshold = value;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    }
  }

  return options;
}

async function readLogs(logsPath) {
  const content = await fs.readFile(logsPath, 'utf8');
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [parsed];
  } catch (error) {
    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    const records = [];
    for (const line of lines) {
      try {
        records.push(JSON.parse(line));
      } catch (lineError) {
        throw new Error(`Failed to parse log line as JSON: ${line}`);
      }
    }
    return records;
  }
}

function hasField(record, field) {
  if (record == null) return false;
  if (Object.prototype.hasOwnProperty.call(record, field)) {
    const value = record[field];
    return value !== undefined && value !== null && value !== '';
  }
  return false;
}

function detectTraceparent(record) {
  if (typeof record.traceparent === 'string' && record.traceparent.length > 0) {
    return true;
  }
  if (typeof record.traceId === 'string' && record.traceId.length > 0) {
    return true;
  }
  const headers = record.headers;
  if (headers && typeof headers.traceparent === 'string' && headers.traceparent.length > 0) {
    return true;
  }
  return false;
}

function summarize(records, threshold) {
  const total = records.length;
  const fieldCoverage = {};
  const missingRecords = [];

  records.forEach((record, index) => {
    const missing = [];
    for (const field of requiredFields) {
      if (!hasField(record, field)) {
        missing.push(field);
      }
    }
    if (!detectTraceparent(record)) {
      missing.push('traceparent');
    }
    if (missing.length > 0) {
      missingRecords.push({ index, missing });
    }
  });

  for (const field of requiredFields) {
    const present = records.filter((record) => hasField(record, field)).length;
    fieldCoverage[field] = {
      present,
      total,
      ratio: total === 0 ? 0 : Number((present / total).toFixed(4))
    };
  }

  const traceparentPresent = records.filter((record) => detectTraceparent(record)).length;
  fieldCoverage.traceparent = {
    present: traceparentPresent,
    total,
    ratio: total === 0 ? 0 : Number((traceparentPresent / total).toFixed(4))
  };

  const optionalCoverage = {};
  for (const field of optionalFields) {
    const present = records.filter((record) => hasField(record, field)).length;
    optionalCoverage[field] = {
      present,
      total,
      ratio: total === 0 ? 0 : Number((present / total).toFixed(4))
    };
  }

  const pass = total > 0 && Object.values(fieldCoverage).every((entry) => entry.ratio >= threshold);

  return {
    totalRecords: total,
    requiredFields,
    optionalFields,
    fieldCoverage,
    optionalCoverage,
    threshold,
    missingRecords,
    status: pass ? 'pass' : 'fail'
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const logsPath = args.logsPath;

  const records = await readLogs(logsPath);
  const summary = summarize(records, args.threshold);
  const outputDir = path.dirname(args.outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    logsPath,
    totalRecords: summary.totalRecords,
    threshold: summary.threshold,
    requiredFields: summary.requiredFields,
    optionalFields: summary.optionalFields,
    fieldCoverage: summary.fieldCoverage,
    optionalCoverage: summary.optionalCoverage,
    missingRecords: summary.missingRecords,
    status: summary.status
  };

  await fs.writeFile(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (args.verbose) {
    console.log(`Trace drill report written to ${args.outputPath}`);
  }

  if (summary.status !== 'pass') {
    console.error('Trace drill failed:');
    if (summary.totalRecords === 0) {
      console.error('  No log records found. Provide Powertools log export.');
    }
    for (const missing of summary.missingRecords) {
      console.error(`  Record ${missing.index} missing fields: ${missing.missing.join(', ')}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Trace drill errored:', error);
  process.exit(1);
});
