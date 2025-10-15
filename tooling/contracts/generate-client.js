#!/usr/bin/env node
/**
 * Client Generation Script
 *
 * Generates a TypeScript API client from the OpenAPI specification.
 * This provides a type-safe HTTP client for mobile/frontend consumption.
 *
 * Per standards/shared-contracts-tier.md:
 * - OpenAPI spec is the source of truth for client generation
 * - Generated client committed to docs/contracts/clients/
 * - Checksum validation ensures no drift
 */

const fs = require('fs');
const path = require('path');

const OPENAPI_INPUT = path.join(__dirname, '../../docs/openapi/openapi-generated.yaml');
const CLIENT_OUTPUT = path.join(__dirname, '../../docs/contracts/clients/photoeditor-api.ts');
const README_OUTPUT = path.join(__dirname, '../../docs/contracts/clients/README.md');

/**
 * Generate TypeScript API client from OpenAPI spec
 */
async function generateClient() {
  console.log('Generating TypeScript API client from OpenAPI spec...');

  try {
    const yaml = require('js-yaml');
    const openapiContent = fs.readFileSync(OPENAPI_INPUT, 'utf8');
    const openapi = yaml.load(openapiContent);

    // Build client code
    const clientCode = [];

    clientCode.push('/**');
    clientCode.push(' * Photo Editor API Client');
    clientCode.push(' * Generated from OpenAPI specification');
    clientCode.push(' * DO NOT EDIT MANUALLY - regenerate with npm run contracts:generate');
    clientCode.push(' */');
    clientCode.push('');

    // Import generated types
    clientCode.push("import type * as Types from './types';");
    clientCode.push('');

    // Base client configuration
    clientCode.push('export interface ApiClientConfig {');
    clientCode.push('  baseUrl: string;');
    clientCode.push('  headers?: Record<string, string>;');
    clientCode.push('  fetch?: typeof fetch;');
    clientCode.push('}');
    clientCode.push('');

    clientCode.push('export interface ApiError {');
    clientCode.push('  code: string;');
    clientCode.push('  message: string;');
    clientCode.push('  details?: Record<string, unknown>;');
    clientCode.push('  timestamp: string;');
    clientCode.push('  requestId?: string;');
    clientCode.push('}');
    clientCode.push('');

    clientCode.push('export class ApiClient {');
    clientCode.push('  private baseUrl: string;');
    clientCode.push('  private headers: Record<string, string>;');
    clientCode.push('  private fetchFn: typeof fetch;');
    clientCode.push('');
    clientCode.push('  constructor(config: ApiClientConfig) {');
    clientCode.push('    this.baseUrl = config.baseUrl.replace(/\\/$/, "");');
    clientCode.push('    this.headers = {');
    clientCode.push("      'Content-Type': 'application/json',");
    clientCode.push('      ...config.headers,');
    clientCode.push('    };');
    clientCode.push('    this.fetchFn = config.fetch || fetch;');
    clientCode.push('  }');
    clientCode.push('');

    // Helper method for requests
    clientCode.push('  private async request<T>(');
    clientCode.push('    method: string,');
    clientCode.push('    path: string,');
    clientCode.push('    options?: {');
    clientCode.push('      body?: unknown;');
    clientCode.push('      query?: Record<string, string>;');
    clientCode.push('      headers?: Record<string, string>;');
    clientCode.push('    }');
    clientCode.push('  ): Promise<T> {');
    clientCode.push('    const url = new URL(`${this.baseUrl}${path}`);');
    clientCode.push('    if (options?.query) {');
    clientCode.push('      Object.entries(options.query).forEach(([key, value]) => {');
    clientCode.push('        url.searchParams.append(key, value);');
    clientCode.push('      });');
    clientCode.push('    }');
    clientCode.push('');
    clientCode.push('    const response = await this.fetchFn(url.toString(), {');
    clientCode.push('      method,');
    clientCode.push('      headers: { ...this.headers, ...options?.headers },');
    clientCode.push('      body: options?.body ? JSON.stringify(options.body) : undefined,');
    clientCode.push('    });');
    clientCode.push('');
    clientCode.push('    if (!response.ok) {');
    clientCode.push('      const error: ApiError = await response.json();');
    clientCode.push('      throw new Error(error.message || `HTTP ${response.status}`);');
    clientCode.push('    }');
    clientCode.push('');
    clientCode.push('    return response.json();');
    clientCode.push('  }');
    clientCode.push('');

    // Generate methods for each operation
    const generatedMethods = new Set();

    for (const [pathTemplate, pathItem] of Object.entries(openapi.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) continue;

        const operationId = operation.operationId;
        if (!operationId || generatedMethods.has(operationId)) continue;

        generatedMethods.add(operationId);

        // Determine parameter and return types
        const pathParams = operation.parameters?.filter(p => p.in === 'path') || [];
        const queryParams = operation.parameters?.filter(p => p.in === 'query') || [];
        const hasBody = operation.requestBody?.required;

        // Build method signature
        clientCode.push(`  /**`);
        clientCode.push(`   * ${operation.summary}`);
        if (operation.description) {
          const desc = operation.description.split('\n')[0]; // First line only
          clientCode.push(`   * ${desc}`);
        }
        if (operation.deprecated) {
          clientCode.push(`   * @deprecated`);
        }
        clientCode.push(`   */`);

        let methodSignature = `  async ${operationId}(`;
        const methodParams = [];

        // Add path parameters
        if (pathParams.length > 0) {
          methodParams.push(`params: { ${pathParams.map(p => `${p.name}: string`).join('; ')} }`);
        }

        // Add request body
        if (hasBody) {
          methodParams.push(`body: any`); // TODO: Could infer type from schema
        }

        // Add query parameters
        if (queryParams.length > 0) {
          const requiredQuery = queryParams.filter(p => p.required);
          const optionalQuery = queryParams.filter(p => !p.required);
          if (requiredQuery.length > 0 || optionalQuery.length > 0) {
            methodParams.push(`query${optionalQuery.length > 0 ? '?' : ''}: { ${queryParams.map(p => `${p.name}${p.required ? '' : '?'}: string`).join('; ')} }`);
          }
        }

        methodSignature += methodParams.join(', ');
        methodSignature += `): Promise<any> {`; // TODO: Could infer return type from schema
        clientCode.push(methodSignature);

        // Build path with parameter substitution
        let pathExpression = `\`${pathTemplate}\``;
        for (const param of pathParams) {
          pathExpression = pathExpression.replace(`{${param.name}}`, `\${params.${param.name}}`);
        }

        // Build request call
        const requestArgs = [
          `'${method.toUpperCase()}'`,
          pathExpression,
        ];

        const requestOptions = [];
        if (hasBody) {
          requestOptions.push('body');
        }
        if (queryParams.length > 0) {
          requestOptions.push('query');
        }

        if (requestOptions.length > 0) {
          requestArgs.push(`{ ${requestOptions.join(', ')} }`);
        }

        clientCode.push(`    return this.request(${requestArgs.join(', ')});`);
        clientCode.push(`  }`);
        clientCode.push('');
      }
    }

    clientCode.push('}');
    clientCode.push('');

    // Export default instance creator
    clientCode.push('export function createApiClient(config: ApiClientConfig): ApiClient {');
    clientCode.push('  return new ApiClient(config);');
    clientCode.push('}');

    // Write client file
    fs.writeFileSync(CLIENT_OUTPUT, clientCode.join('\n'), 'utf8');
    console.log(`  ✓ API client written to ${path.relative(process.cwd(), CLIENT_OUTPUT)}`);

    return clientCode.join('\n');
  } catch (error) {
    console.error('Failed to generate API client:', error.message);
    throw error;
  }
}

/**
 * Generate README documentation for the client
 */
async function generateReadme() {
  console.log('Generating client README...');

  const readme = [];
  readme.push('# Generated API Client');
  readme.push('');
  readme.push('This directory contains auto-generated API clients and types for the Photo Editor API.');
  readme.push('');
  readme.push('## Files');
  readme.push('');
  readme.push('- `types.ts` - TypeScript type definitions generated from Zod schemas');
  readme.push('- `photoeditor-api.ts` - API client with methods for all endpoints');
  readme.push('- `checksums.json` - Artifact checksums for drift detection');
  readme.push('');
  readme.push('## Usage');
  readme.push('');
  readme.push('```typescript');
  readme.push("import { createApiClient } from '@/docs/contracts/clients/photoeditor-api';");
  readme.push('');
  readme.push('const client = createApiClient({');
  readme.push("  baseUrl: 'https://api.photoeditor.com',");
  readme.push('  headers: {');
  readme.push("    'Authorization': 'Bearer <token>'");
  readme.push('  }');
  readme.push('});');
  readme.push('');
  readme.push('// Upload a photo');
  readme.push('const uploadResult = await client.presignUpload({');
  readme.push("  fileName: 'photo.jpg',");
  readme.push("  contentType: 'image/jpeg',");
  readme.push('  fileSize: 1024000');
  readme.push('});');
  readme.push('');
  readme.push('// Get job status');
  readme.push('const status = await client.getJobStatus({ id: jobId });');
  readme.push('```');
  readme.push('');
  readme.push('## Regeneration');
  readme.push('');
  readme.push('To regenerate these files after schema changes:');
  readme.push('');
  readme.push('```bash');
  readme.push('npm run contracts:generate --prefix shared');
  readme.push('```');
  readme.push('');
  readme.push('## Contract Governance');
  readme.push('');
  readme.push('Per `standards/shared-contracts-tier.md`:');
  readme.push('');
  readme.push('- **Source of Truth**: Zod schemas in `shared/schemas/` + routes manifest in `shared/routes.manifest.ts`');
  readme.push('- **Generated Artifacts**: Committed to this directory for CI drift detection');
  readme.push('- **Breaking Changes**: Require API versioning (e.g., `/v2/`) and deprecation timeline');
  readme.push('- **Validation**: `npm run contracts:check` verifies checksums match');
  readme.push('');
  readme.push('## Architecture Decision Records');
  readme.push('');
  readme.push('- [ADR-0003: Contract-First API](../../../adr/0003-contract-first-api.md)');
  readme.push('- [ADR-0005: API Versioning](../../../adr/0005-api-versioning.md) (if exists)');
  readme.push('');

  fs.writeFileSync(README_OUTPUT, readme.join('\n'), 'utf8');
  console.log(`  ✓ README written to ${path.relative(process.cwd(), README_OUTPUT)}`);

  return readme.join('\n');
}

/**
 * Main entry point
 */
async function main() {
  console.log('Client Code Generation');
  console.log('======================\n');

  try {
    const clientCode = await generateClient();
    console.log('');

    const readmeCode = await generateReadme();
    console.log('');

    console.log('SUCCESS: Client generation complete');
    console.log('');
    console.log('Generated files:');
    console.log('  - photoeditor-api.ts');
    console.log('  - README.md');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('\nERROR: Client generation failed');
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { generateClient, generateReadme };
