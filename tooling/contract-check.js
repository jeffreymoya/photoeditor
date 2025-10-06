#!/usr/bin/env node
/**
 * Contract Drift Detection Script
 *
 * Purpose: Ensures that the generated API contracts from @photoeditor/shared
 * remain consistent between builds, preventing silent drift between backend
 * and mobile clients.
 *
 * This script implements the Stage 1 gate from docs/rubric.md for zero
 * contract drift per STANDARDS.md line 40 (breaking changes require /v{n}).
 *
 * Exit codes:
 *   0 - Contracts match (no drift)
 *   1 - Contracts diverged (drift detected)
 *   2 - Error running check
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SHARED_DIST = path.join(__dirname, '../shared/dist');
const CONTRACTS_CLIENTS = path.join(__dirname, '../docs/contracts/clients');
const OPENAPI_GENERATED = path.join(__dirname, '../docs/openapi/openapi-generated.yaml');
const SNAPSHOT_FILE = path.join(__dirname, '../shared/contract-snapshot.json');

function calculateHash(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

function generateContractSnapshot() {
  const snapshot = {
    timestamp: new Date().toISOString(),
    files: {}
  };

  // Find all .d.ts and .js files in shared/dist (contract artifacts)
  function scanDirectory(dir, baseDir = dir, label = '') {
    if (!fs.existsSync(dir)) {
      return; // Skip if directory doesn't exist
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDirectory(fullPath, baseDir, label);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        // Track TypeScript/JavaScript artifacts and generated contract files
        if (ext === '.d.ts' || ext === '.js' || ext === '.ts' || ext === '.yaml' || ext === '.json') {
          const relativePath = label ? `${label}/${path.relative(baseDir, fullPath)}` : path.relative(baseDir, fullPath);
          snapshot.files[relativePath] = calculateHash(fullPath);
        }
      }
    }
  }

  if (!fs.existsSync(SHARED_DIST)) {
    console.error('ERROR: shared/dist not found. Run "npm run build --prefix shared" first.');
    process.exit(2);
  }

  // Scan shared/dist for built artifacts
  scanDirectory(SHARED_DIST, SHARED_DIST, 'shared/dist');

  // Scan generated contract artifacts
  if (fs.existsSync(CONTRACTS_CLIENTS)) {
    scanDirectory(CONTRACTS_CLIENTS, CONTRACTS_CLIENTS, 'contracts/clients');
  }

  // Include generated OpenAPI spec if it exists
  if (fs.existsSync(OPENAPI_GENERATED)) {
    snapshot.files['openapi/openapi-generated.yaml'] = calculateHash(OPENAPI_GENERATED);
  }

  return snapshot;
}

function compareSnapshots(current, previous) {
  const differences = {
    added: [],
    removed: [],
    modified: []
  };

  // Check for new and modified files
  for (const [file, hash] of Object.entries(current.files)) {
    if (!previous.files[file]) {
      differences.added.push(file);
    } else if (previous.files[file] !== hash) {
      differences.modified.push(file);
    }
  }

  // Check for removed files
  for (const file of Object.keys(previous.files)) {
    if (!current.files[file]) {
      differences.removed.push(file);
    }
  }

  return differences;
}

function main() {
  console.log('Contract Drift Detection');
  console.log('========================\n');

  // Generate current snapshot
  console.log('Generating current contract snapshot from shared/dist...');
  const currentSnapshot = generateContractSnapshot();
  console.log(`Found ${Object.keys(currentSnapshot.files).length} contract files.\n`);

  // Check if snapshot file exists
  if (!fs.existsSync(SNAPSHOT_FILE)) {
    console.log('No previous snapshot found. Creating initial baseline...');
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(currentSnapshot, null, 2));
    console.log(`Snapshot saved to ${path.relative(process.cwd(), SNAPSHOT_FILE)}`);
    console.log('\nSUCCESS: Initial contract snapshot created.');
    process.exit(0);
  }

  // Load previous snapshot
  console.log('Loading previous contract snapshot...');
  const previousSnapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
  console.log(`Previous snapshot: ${previousSnapshot.timestamp}`);
  console.log(`Current snapshot: ${currentSnapshot.timestamp}\n`);

  // Compare snapshots
  const differences = compareSnapshots(currentSnapshot, previousSnapshot);

  // Report differences
  let hasDrift = false;

  if (differences.added.length > 0) {
    hasDrift = true;
    console.log('ADDED FILES:');
    differences.added.forEach(file => console.log(`  + ${file}`));
    console.log('');
  }

  if (differences.removed.length > 0) {
    hasDrift = true;
    console.log('REMOVED FILES:');
    differences.removed.forEach(file => console.log(`  - ${file}`));
    console.log('');
  }

  if (differences.modified.length > 0) {
    hasDrift = true;
    console.log('MODIFIED FILES:');
    differences.modified.forEach(file => console.log(`  ~ ${file}`));
    console.log('');
  }

  if (hasDrift) {
    console.error('FAILURE: Contract drift detected!');
    console.error('');
    console.error('The API contracts have changed. This may indicate:');
    console.error('1. Breaking changes that require /v{n} versioning (STANDARDS.md line 40)');
    console.error('2. Schema modifications that need backward compatibility tests');
    console.error('3. Unintentional contract divergence between backend and mobile');
    console.error('');
    console.error('Actions required:');
    console.error('- Review changes with "git diff shared/"');
    console.error('- Run contract compatibility tests: npm run test:contracts');
    console.error('- Update version if breaking: npm version [major|minor|patch] --prefix shared');
    console.error('- Update snapshot if changes are intentional: npm run contracts:check');
    console.error('');
    process.exit(1);
  }

  console.log('SUCCESS: No contract drift detected.');
  console.log('All API contracts match the baseline snapshot.\n');
  process.exit(0);
}

// Allow updating snapshot with --update flag
if (process.argv.includes('--update')) {
  console.log('Updating contract snapshot...\n');
  const snapshot = generateContractSnapshot();
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
  console.log('Contract snapshot updated successfully.');
  process.exit(0);
}

main();
