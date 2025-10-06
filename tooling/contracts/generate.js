#!/usr/bin/env node
/**
 * Contract Code Generation Script
 *
 * Purpose: Generates OpenAPI specs, TypeScript types, and client artifacts from
 * Zod schemas in @photoeditor/shared per standards/shared-contracts-tier.md.
 *
 * This script implements the contract codegen pipeline:
 * 1. Zod schemas → OpenAPI spec (zod-to-openapi)
 * 2. Zod schemas → TypeScript type definitions (zod-to-ts)
 * 3. Store generated artifacts in docs/contracts/clients/ with checksums
 *
 * Requirements:
 * - Zod schema remains SSOT (standards/shared-contracts-tier.md line 5)
 * - Generated artifacts committed for CI drift detection (line 19)
 * - Idempotent and deterministic for CI reproducibility
 *
 * Exit codes:
 *   0 - Generation successful
 *   1 - Generation failed
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Paths
const SHARED_ROOT = path.join(__dirname, '../../shared');
const DOCS_CONTRACTS = path.join(__dirname, '../../docs/contracts');
const CLIENTS_DIR = path.join(DOCS_CONTRACTS, 'clients');
const OPENAPI_OUTPUT = path.join(__dirname, '../../docs/openapi/openapi-generated.yaml');
const TYPES_OUTPUT = path.join(CLIENTS_DIR, 'types.ts');
const CHECKSUM_FILE = path.join(CLIENTS_DIR, 'checksums.json');

// Ensure output directories exist
function ensureDirectories() {
  [CLIENTS_DIR, path.dirname(OPENAPI_OUTPUT)].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

function calculateChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Generate OpenAPI spec from Zod schemas using zod-to-openapi
 */
async function generateOpenAPI() {
  console.log('Generating OpenAPI specification from Zod schemas...');

  try {
    // Use zodToJsonSchema for better compatibility
    const { zodToJsonSchema } = require('zod-to-json-schema');

    // Import compiled schemas from shared/dist
    const distPath = path.join(SHARED_ROOT, 'dist');
    if (!fs.existsSync(distPath)) {
      throw new Error('shared/dist not found. Run "npm run build --prefix shared" first.');
    }

    // Import schemas
    const schemas = require(path.join(distPath, 'schemas/index.js'));

    // Helper to convert Zod schema to OpenAPI component
    const toOpenAPISchema = (zodSchema, name) => {
      const jsonSchema = zodToJsonSchema(zodSchema, name);
      // Remove JSON Schema specific fields that aren't valid in OpenAPI
      delete jsonSchema.$schema;
      return jsonSchema;
    };

    // Build OpenAPI document manually
    const document = {
      openapi: '3.0.3',
      info: {
        title: 'Photo Editor API',
        version: '1.0.0',
        description: 'API contracts generated from Zod schemas for the Photo Editor application',
        contact: {
          name: 'API Support'
        }
      },
      servers: [
        {
          url: 'http://localhost:4566',
          description: 'LocalStack development server'
        },
        {
          url: 'https://api.photoeditor.dev',
          description: 'Development environment'
        },
        {
          url: 'https://api.photoeditor.com',
          description: 'Production environment'
        }
      ],
      components: {
        schemas: {}
      }
    };

    // Register API schemas
    document.components.schemas.FileUpload = toOpenAPISchema(schemas.FileUploadSchema, 'FileUpload');
    document.components.schemas.PresignUploadRequest = toOpenAPISchema(schemas.PresignUploadRequestSchema, 'PresignUploadRequest');
    document.components.schemas.PresignUploadResponse = toOpenAPISchema(schemas.PresignUploadResponseSchema, 'PresignUploadResponse');
    document.components.schemas.BatchUploadRequest = toOpenAPISchema(schemas.BatchUploadRequestSchema, 'BatchUploadRequest');
    document.components.schemas.BatchUploadResponse = toOpenAPISchema(schemas.BatchUploadResponseSchema, 'BatchUploadResponse');
    document.components.schemas.JobStatusResponse = toOpenAPISchema(schemas.JobResponseSchema, 'JobStatusResponse');
    document.components.schemas.DeviceTokenRegistration = toOpenAPISchema(schemas.DeviceTokenRegistrationSchema, 'DeviceTokenRegistration');
    document.components.schemas.DeviceTokenResponse = toOpenAPISchema(schemas.DeviceTokenResponseSchema, 'DeviceTokenResponse');
    document.components.schemas.HealthCheckResponse = toOpenAPISchema(schemas.HealthCheckResponseSchema, 'HealthCheckResponse');
    document.components.schemas.ApiError = toOpenAPISchema(schemas.ApiErrorSchema, 'ApiError');

    // Register job schemas
    document.components.schemas.Job = toOpenAPISchema(schemas.JobSchema, 'Job');
    document.components.schemas.JobStatus = toOpenAPISchema(schemas.JobStatusSchema, 'JobStatus');
    document.components.schemas.CreateJobRequest = toOpenAPISchema(schemas.CreateJobRequestSchema, 'CreateJobRequest');
    document.components.schemas.BatchJob = toOpenAPISchema(schemas.BatchJobSchema, 'BatchJob');
    document.components.schemas.CreateBatchJobRequest = toOpenAPISchema(schemas.CreateBatchJobRequestSchema, 'CreateBatchJobRequest');
    document.components.schemas.JobStatusUpdate = toOpenAPISchema(schemas.JobStatusUpdateSchema, 'JobStatusUpdate');

    // Register provider schemas
    document.components.schemas.GeminiAnalysisRequest = toOpenAPISchema(schemas.GeminiAnalysisRequestSchema, 'GeminiAnalysisRequest');
    document.components.schemas.GeminiAnalysisResponse = toOpenAPISchema(schemas.GeminiAnalysisResponseSchema, 'GeminiAnalysisResponse');
    document.components.schemas.SeedreamEditingRequest = toOpenAPISchema(schemas.SeedreamEditingRequestSchema, 'SeedreamEditingRequest');
    document.components.schemas.SeedreamEditingResponse = toOpenAPISchema(schemas.SeedreamEditingResponseSchema, 'SeedreamEditingResponse');
    document.components.schemas.ProviderConfig = toOpenAPISchema(schemas.ProviderConfigSchema, 'ProviderConfig');
    document.components.schemas.ProviderResponse = toOpenAPISchema(schemas.ProviderResponseSchema, 'ProviderResponse');

    // Sanitize document by converting to JSON and back (removes functions)
    const sanitizedDocument = JSON.parse(JSON.stringify(document));

    // Convert to YAML
    const yaml = require('js-yaml');
    const yamlContent = yaml.dump(sanitizedDocument, { lineWidth: 120, noRefs: false });

    // Write OpenAPI spec
    fs.writeFileSync(OPENAPI_OUTPUT, yamlContent, 'utf8');
    console.log(`  ✓ OpenAPI spec written to ${path.relative(process.cwd(), OPENAPI_OUTPUT)}`);

    return yamlContent;
  } catch (error) {
    console.error('Failed to generate OpenAPI spec:', error.message);
    throw error;
  }
}

/**
 * Generate TypeScript type definitions from Zod schemas
 */
async function generateTypeScriptTypes() {
  console.log('Generating TypeScript type definitions...');

  try {
    const { printNode, zodToTs } = require('zod-to-ts');

    // Import compiled schemas
    const distPath = path.join(SHARED_ROOT, 'dist');
    const schemas = require(path.join(distPath, 'schemas/index.js'));

    // Generate types for key schemas
    const typeDefinitions = [];

    typeDefinitions.push('/**');
    typeDefinitions.push(' * Generated TypeScript types from Zod schemas');
    typeDefinitions.push(' * DO NOT EDIT MANUALLY - regenerate with npm run contracts:generate');
    typeDefinitions.push(' * Source: @photoeditor/shared/schemas');
    typeDefinitions.push(' */');
    typeDefinitions.push('');

    // Helper to generate type from schema
    const generateType = (name, schema) => {
      try {
        const { node } = zodToTs(schema, name);
        return `export ${printNode(node)}`;
      } catch (error) {
        console.warn(`  ⚠ Could not generate type for ${name}:`, error.message);
        return `// Unable to generate type for ${name}`;
      }
    };

    // API types
    typeDefinitions.push('// API Request/Response Types');
    typeDefinitions.push(generateType('FileUpload', schemas.FileUploadSchema));
    typeDefinitions.push(generateType('PresignUploadRequest', schemas.PresignUploadRequestSchema));
    typeDefinitions.push(generateType('PresignUploadResponse', schemas.PresignUploadResponseSchema));
    typeDefinitions.push(generateType('BatchUploadRequest', schemas.BatchUploadRequestSchema));
    typeDefinitions.push(generateType('BatchUploadResponse', schemas.BatchUploadResponseSchema));
    typeDefinitions.push('');

    // Job types
    typeDefinitions.push('// Job Types');
    typeDefinitions.push(generateType('Job', schemas.JobSchema));
    typeDefinitions.push(generateType('CreateJobRequest', schemas.CreateJobRequestSchema));
    typeDefinitions.push(generateType('JobResponse', schemas.JobResponseSchema));
    typeDefinitions.push(generateType('BatchJob', schemas.BatchJobSchema));
    typeDefinitions.push('');

    // Write types file
    const typesContent = typeDefinitions.join('\n');
    fs.writeFileSync(TYPES_OUTPUT, typesContent, 'utf8');
    console.log(`  ✓ TypeScript types written to ${path.relative(process.cwd(), TYPES_OUTPUT)}`);

    return typesContent;
  } catch (error) {
    console.error('Failed to generate TypeScript types:', error.message);
    throw error;
  }
}

/**
 * Generate checksums for all artifacts
 */
function generateChecksums(artifacts) {
  console.log('Generating artifact checksums...');

  const checksums = {
    generated_at: new Date().toISOString(),
    artifacts: {}
  };

  for (const [name, content] of Object.entries(artifacts)) {
    checksums.artifacts[name] = {
      checksum: calculateChecksum(content),
      size: content.length,
      type: path.extname(name).slice(1) || 'unknown'
    };
  }

  fs.writeFileSync(CHECKSUM_FILE, JSON.stringify(checksums, null, 2), 'utf8');
  console.log(`  ✓ Checksums written to ${path.relative(process.cwd(), CHECKSUM_FILE)}`);

  return checksums;
}

/**
 * Main generation pipeline
 */
async function main() {
  console.log('Contract Code Generation');
  console.log('========================\n');

  try {
    // Ensure directories exist
    ensureDirectories();

    // Step 1: Build shared package to ensure latest schemas
    console.log('Building @photoeditor/shared package...');
    const { execSync } = require('child_process');
    execSync('npm run build', {
      cwd: SHARED_ROOT,
      stdio: 'inherit'
    });
    console.log('  ✓ Build complete\n');

    // Step 2: Generate OpenAPI spec
    const openapiContent = await generateOpenAPI();
    console.log('');

    // Step 3: Generate TypeScript types
    const typesContent = await generateTypeScriptTypes();
    console.log('');

    // Step 4: Generate checksums
    const artifacts = {
      'openapi-generated.yaml': openapiContent,
      'types.ts': typesContent
    };
    const checksums = generateChecksums(artifacts);
    console.log('');

    // Summary
    console.log('SUCCESS: Contract generation complete');
    console.log('');
    console.log('Generated artifacts:');
    Object.keys(checksums.artifacts).forEach(name => {
      const artifact = checksums.artifacts[name];
      console.log(`  - ${name} (${artifact.size} bytes, checksum: ${artifact.checksum.slice(0, 8)}...)`);
    });
    console.log('');
    console.log('Next steps:');
    console.log('  1. Review generated files in docs/contracts/clients/');
    console.log('  2. Run "npm run contracts:check" to update drift baseline');
    console.log('  3. Commit changes with context about schema modifications');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('\nERROR: Contract generation failed');
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { generateOpenAPI, generateTypeScriptTypes, generateChecksums };
