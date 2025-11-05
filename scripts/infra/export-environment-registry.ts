#!/usr/bin/env tsx

/**
 * Environment Registry Export Script
 *
 * Collects SST and Terraform outputs per stage and generates the authoritative
 * environment registry at docs/infra/environment-registry.json.
 *
 * Standards:
 * - infrastructure-tier.md L12 (SST envs map 1:1 to stage, outputs recorded in registry)
 * - cross-cutting.md L121-133 (evidence bundle, governance artifacts)
 * - typescript.md L8-14 (strict mode, exactOptionalPropertyTypes)
 *
 * Task: TASK-0827
 *
 * Usage:
 *   pnpm tsx scripts/infra/export-environment-registry.ts
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Environment registry schema per docs/infra/environment-registry.md
 */

const EnvironmentResourcesSchema = z.object({
  sst: z.record(z.union([z.string(), z.null()])),
  terraform: z.record(z.union([z.string(), z.null()])),
});

const EnvironmentMetadataSchema = z.object({
  generatedBy: z.string().nullable(),
  sstVersion: z.string().nullable(),
  terraformVersion: z.string().nullable(),
  nodeVersion: z.string().nullable(),
});

const EnvironmentEntrySchema = z.object({
  stage: z.enum(['dev', 'stage', 'prod']),
  timestamp: z.string().datetime().nullable(),
  region: z.string().nullable(),
  stack: z.string().nullable(),
  resources: EnvironmentResourcesSchema,
  metadata: EnvironmentMetadataSchema,
});

const EnvironmentRegistrySchema = z.object({
  version: z.literal('1.0'),
  generated: z.string().datetime(),
  environments: z.object({
    dev: EnvironmentEntrySchema,
    stage: EnvironmentEntrySchema,
    prod: EnvironmentEntrySchema,
  }),
});

type EnvironmentResources = z.infer<typeof EnvironmentResourcesSchema>;
type EnvironmentMetadata = z.infer<typeof EnvironmentMetadataSchema>;
type EnvironmentEntry = z.infer<typeof EnvironmentEntrySchema>;
type EnvironmentRegistry = z.infer<typeof EnvironmentRegistrySchema>;

/**
 * Execute command and return stdout, or null if command fails
 */
function execSafe(command: string, cwd?: string): string | null {
  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      cwd: cwd ?? process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Get SST outputs for a stage, returns null if stage not deployed
 */
function getSSTOutputs(stage: string): Record<string, string> | null {
  const sstDir = resolve(__dirname, '../../infra/sst');

  // Try to get SST outputs for this stage
  const output = execSafe(`pnpm sst output --stage ${stage} --format json`, sstDir);

  if (!output) {
    console.warn(`[WARN] SST stage '${stage}' not deployed or accessible`);
    return null;
  }

  try {
    const parsed = JSON.parse(output);
    return parsed;
  } catch (error) {
    console.warn(`[WARN] Failed to parse SST outputs for stage '${stage}'`);
    return null;
  }
}

/**
 * Get Terraform outputs, returns null if not available
 */
function getTerraformOutputs(): Record<string, string> | null {
  const tfDir = resolve(__dirname, '../../infrastructure');

  // Try to get Terraform outputs
  const output = execSafe('terraform output -json', tfDir);

  if (!output) {
    console.warn('[WARN] Terraform outputs not available (no backend configured or not deployed)');
    return null;
  }

  try {
    const parsed = JSON.parse(output);
    // Terraform wraps outputs in { value: ... } objects, unwrap them
    const unwrapped: Record<string, string> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'object' && val !== null && 'value' in val) {
        unwrapped[key] = String((val as { value: unknown }).value);
      }
    }
    return unwrapped;
  } catch (error) {
    console.warn('[WARN] Failed to parse Terraform outputs');
    return null;
  }
}

/**
 * Get version metadata
 */
function getVersionMetadata(): EnvironmentMetadata {
  const sstDir = resolve(__dirname, '../../infra/sst');

  const sstVersion = execSafe('pnpm sst version', sstDir);
  const terraformVersion = execSafe('terraform version -json');
  const nodeVersion = execSafe('node --version');

  return {
    generatedBy: 'scripts/infra/export-environment-registry.ts',
    sstVersion,
    terraformVersion: terraformVersion ? JSON.parse(terraformVersion).terraform_version : null,
    nodeVersion,
  };
}

/**
 * Build environment entry for a stage
 */
function buildEnvironmentEntry(
  stage: 'dev' | 'stage' | 'prod',
  sstOutputs: Record<string, string> | null,
  terraformOutputs: Record<string, string> | null,
  metadata: EnvironmentMetadata,
): EnvironmentEntry {
  const timestamp = sstOutputs ? new Date().toISOString() : null;
  const region = sstOutputs?.region ?? terraformOutputs?.region ?? null;
  const stack = sstOutputs ? `photoeditor-${stage}` : null;

  const resources: EnvironmentResources = {
    sst: sstOutputs ?? {},
    terraform: terraformOutputs ?? {},
  };

  return {
    stage,
    timestamp,
    region,
    stack,
    resources,
    metadata: timestamp ? metadata : {
      generatedBy: null,
      sstVersion: null,
      terraformVersion: null,
      nodeVersion: null,
    },
  };
}

/**
 * Main execution
 */
function main(): void {
  console.log('[INFO] Collecting environment registry data...');

  // Get version metadata once
  const metadata = getVersionMetadata();
  console.log('[INFO] Metadata:', metadata);

  // Collect outputs for each stage
  const stages: Array<'dev' | 'stage' | 'prod'> = ['dev', 'stage', 'prod'];
  const environments: Record<string, EnvironmentEntry> = {};

  for (const stage of stages) {
    console.log(`[INFO] Collecting outputs for stage: ${stage}`);

    const sstOutputs = getSSTOutputs(stage);
    // Note: Terraform outputs are not stage-specific in current setup
    const terraformOutputs = stage === 'dev' ? getTerraformOutputs() : null;

    environments[stage] = buildEnvironmentEntry(stage, sstOutputs, terraformOutputs, metadata);

    if (sstOutputs) {
      console.log(`[INFO] ✓ Stage '${stage}' has ${Object.keys(sstOutputs).length} SST outputs`);
    } else {
      console.log(`[INFO] ✗ Stage '${stage}' not deployed`);
    }
  }

  // Build registry
  const registry: EnvironmentRegistry = {
    version: '1.0',
    generated: new Date().toISOString(),
    environments: {
      dev: environments['dev'],
      stage: environments['stage'],
      prod: environments['prod'],
    },
  };

  // Validate against schema
  try {
    EnvironmentRegistrySchema.parse(registry);
    console.log('[INFO] ✓ Registry validated against schema');
  } catch (error) {
    console.error('[ERROR] Registry validation failed:', error);
    process.exit(1);
  }

  // Write to file
  const outputPath = resolve(__dirname, '../../docs/infra/environment-registry.json');
  writeFileSync(outputPath, JSON.stringify(registry, null, 2), 'utf-8');

  console.log(`[INFO] ✓ Registry written to: ${outputPath}`);
  console.log('[INFO] Registry generation complete');
}

// Execute
main();
