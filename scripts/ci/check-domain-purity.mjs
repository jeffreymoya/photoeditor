#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const backendSrc = path.join(repoRoot, 'backend', 'src');
const defaultOutputPath = path.join(repoRoot, 'docs', 'evidence', 'domain-purity.json');
const bannedImportPatterns = ['@aws-sdk/', 'aws-sdk', '@aws-lambda-powertools', '@middy/', 'aws-lambda'];
const predicateAllowedKinds = new Set([
  ts.SyntaxKind.BooleanKeyword,
  ts.SyntaxKind.VoidKeyword,
  ts.SyntaxKind.UndefinedKeyword
]);

function parseArgs(argv) {
  const result = {
    outputPath: defaultOutputPath,
    verbose: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output' || arg === '-o') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value after --output');
      }
      result.outputPath = path.resolve(process.cwd(), value);
      i += 1;
    } else if (arg.startsWith('--output=')) {
      const value = arg.split('=')[1];
      result.outputPath = path.resolve(process.cwd(), value);
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    }
  }

  return result;
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch (error) {
    return false;
  }
}

async function collectTsFiles(startDir) {
  const stack = [startDir];
  const files = [];

  while (stack.length > 0) {
    const current = stack.pop();
    // eslint-disable-next-line no-await-in-loop
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        if (!entry.name.endsWith('.ts')) continue;
        if (entry.name.endsWith('.test.ts')) continue;
        const normalized = fullPath.replace(/\\/g, '/');
        if (normalized.includes('/domain/') || normalized.endsWith('.domain.ts')) {
          files.push(fullPath);
        }
      }
    }
  }

  return files.sort();
}

function isExported(node) {
  return Array.isArray(node.modifiers) && node.modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function extractIdentifierText(typeName) {
  if (ts.isIdentifier(typeName)) {
    return typeName.text;
  }
  if (ts.isQualifiedName(typeName)) {
    return extractIdentifierText(typeName.right);
  }
  return '';
}

function isResultType(typeNode) {
  if (!typeNode) return false;

  if (ts.isTypeReferenceNode(typeNode)) {
    const identifier = extractIdentifierText(typeNode.typeName);
    if (identifier === 'Result' || identifier === 'ResultAsync') {
      return true;
    }
    if (identifier === 'Promise' && Array.isArray(typeNode.typeArguments) && typeNode.typeArguments.length > 0) {
      return typeNode.typeArguments.some((inner) => isResultType(inner));
    }
  }

  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.every((inner) => isResultType(inner));
  }

  return false;
}

function isAllowedReturnType(typeNode) {
  if (!typeNode) {
    return false;
  }

  if (isResultType(typeNode)) {
    return true;
  }

  if (predicateAllowedKinds.has(typeNode.kind)) {
    return true;
  }

  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.every((inner) => isAllowedReturnType(inner));
  }

  if (ts.isTypePredicateNode(typeNode)) {
    return true;
  }

  if (ts.isParenthesizedTypeNode(typeNode)) {
    return isAllowedReturnType(typeNode.type);
  }

  if (ts.isTypeReferenceNode(typeNode)) {
    const identifier = extractIdentifierText(typeNode.typeName);
    if (identifier === 'Promise') {
      return Array.isArray(typeNode.typeArguments) && typeNode.typeArguments.some((inner) => isResultType(inner));
    }
  }

  return false;
}

function recordViolation(violations, sourceFile, node, rule, message) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  violations.push({
    file: path.relative(repoRoot, sourceFile.fileName).replace(/\\/g, '/'),
    line: line + 1,
    column: character + 1,
    rule,
    message
  });
}

function checkImports(sourceFile, violations) {
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const moduleName = statement.moduleSpecifier.text;
      if (moduleName && bannedImportPatterns.some((pattern) => moduleName.includes(pattern))) {
        recordViolation(
          violations,
          sourceFile,
          statement.moduleSpecifier,
          'domain-no-infra-imports',
          `Domain modules must not import infrastructure dependency "${moduleName}"`
        );
      }
    }
  }
}

function getReturnTypeNodeFromDeclaration(declaration) {
  if (declaration.type) {
    return declaration.type;
  }
  if (declaration.initializer && ts.isArrowFunction(declaration.initializer)) {
    return declaration.initializer.type;
  }
  if (declaration.initializer && ts.isFunctionExpression(declaration.initializer)) {
    return declaration.initializer.type;
  }
  return undefined;
}

function checkExportedFunctions(sourceFile, violations) {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement)) {
      if (!statement.type) {
        recordViolation(
          violations,
          sourceFile,
          statement.name,
          'domain-result-return',
          `Exported function ${statement.name.text} must declare an explicit Result/ResultAsync or predicate return type`
        );
        continue;
      }
      if (!isAllowedReturnType(statement.type)) {
        recordViolation(
          violations,
          sourceFile,
          statement.type,
          'domain-result-return',
          `Exported function ${statement.name.text} must return Result/ResultAsync or an allowed predicate type`
        );
      }
    }

    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const typeNode = getReturnTypeNodeFromDeclaration(declaration);
        const name = declaration.name && ts.isIdentifier(declaration.name) ? declaration.name.text : '<anonymous>';
        if (!typeNode) {
          recordViolation(
            violations,
            sourceFile,
            declaration.name,
            'domain-result-return',
            `Exported function ${name} must declare an explicit Result/ResultAsync or predicate return type`
          );
          continue;
        }
        if (!isAllowedReturnType(typeNode)) {
          recordViolation(
            violations,
            sourceFile,
            typeNode,
            'domain-result-return',
            `Exported function ${name} must return Result/ResultAsync or an allowed predicate type`
          );
        }
      }
    }
  }
}

function checkThrows(sourceFile, violations) {
  function visit(node) {
    if (ts.isThrowStatement(node)) {
      recordViolation(
        violations,
        sourceFile,
        node.expression || node,
        'domain-no-throws',
        'Domain modules should return Result/ResultAsync instead of throwing exceptions'
      );
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(sourceFile, visit);
}

async function analyzeFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const violations = [];

  checkImports(sourceFile, violations);
  checkExportedFunctions(sourceFile, violations);
  checkThrows(sourceFile, violations);

  return {
    filePath,
    violations
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!(await pathExists(backendSrc))) {
    console.error('Backend source directory not found:', backendSrc);
    process.exit(1);
  }

  const files = await collectTsFiles(backendSrc);
  if (files.length === 0) {
    console.warn('No domain files found to scan.');
  }

  const analysisResults = [];
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    analysisResults.push(await analyzeFile(file));
  }

  const allViolations = analysisResults.flatMap((result) => result.violations);

  const outputDir = path.dirname(args.outputPath);
  if (!(await pathExists(outputDir))) {
    await fs.mkdir(outputDir, { recursive: true });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    root: path.relative(process.cwd(), repoRoot) || '.',
    filesChecked: files.length,
    violations: allViolations,
    status: allViolations.length === 0 ? 'pass' : 'fail'
  };

  await fs.writeFile(args.outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  if (args.verbose) {
    console.log(`Domain purity summary written to ${args.outputPath}`);
  }

  if (allViolations.length > 0) {
    console.error('Domain purity check failed:');
    for (const violation of allViolations) {
      console.error(`  ${violation.file}:${violation.line}:${violation.column} [${violation.rule}] ${violation.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Domain purity check errored:', error);
  process.exit(1);
});
