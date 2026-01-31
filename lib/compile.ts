// lib/compile.ts — Solidity compilation service using solc
import solc from 'solc';
import path from 'path';
import fs from 'fs';
import {
  scanSourceCode,
  scanBytecode,
  createIntegrityHash,
  type SecurityReport,
  type IntegrityHashes,
} from './contract-security';

interface CompiledContract {
  abi: any[];
  bytecode: string;
  deployedBytecode: string;
  gasEstimates: any;
  source: string;
}

interface CompileResult {
  success: boolean;
  contracts: Record<string, CompiledContract>;
  warnings: any[];
}

/**
 * Compile Solidity source files.
 * @param contracts Object of { filename: sourceCode } pairs
 */
export function compileContracts(
  contracts: Record<string, string>
): CompileResult {
  const input = {
    language: 'Solidity',
    sources: {} as Record<string, { content: string }>,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'evm.gasEstimates'],
        },
      },
    },
  };

  for (const [filename, source] of Object.entries(contracts)) {
    input.sources[filename] = { content: source };
  }

  console.log('[Compile] Compiling contracts:', Object.keys(contracts));

  const output = JSON.parse(
    solc.compile(JSON.stringify(input), { import: findImports })
  );

  // Check for hard errors
  if (output.errors) {
    const errors = output.errors.filter(
      (e: any) => e.severity === 'error'
    );
    if (errors.length > 0) {
      console.error('[Compile] Errors:', errors);
      throw new Error(
        'Compilation failed:\n' +
          errors.map((e: any) => e.formattedMessage).join('\n')
      );
    }
  }

  const compiled: Record<string, CompiledContract> = {};

  for (const sourceFile in output.contracts) {
    for (const contractName in output.contracts[sourceFile]) {
      const contract = output.contracts[sourceFile][contractName];
      compiled[contractName] = {
        abi: contract.abi,
        bytecode: contract.evm.bytecode.object,
        deployedBytecode: contract.evm.deployedBytecode.object,
        gasEstimates: contract.evm.gasEstimates,
        source: sourceFile,
      };
      console.log(`[Compile] ${contractName}: ${contract.evm.bytecode.object.length / 2} bytes`);
    }
  }

  return {
    success: true,
    contracts: compiled,
    warnings: output.errors?.filter((e: any) => e.severity === 'warning') || [],
  };
}

export interface CompileAndScanResult {
  success: boolean;
  contracts: Record<string, CompiledContract>;
  warnings: any[];
  sourceReport: SecurityReport;
  bytecodeReport: SecurityReport;
  integrityHashes: IntegrityHashes;
  securityScore: number;
}

/**
 * Compile contracts with full security scanning pipeline.
 * Source scan → compile → bytecode scan → integrity hash.
 * Rejects on any critical finding.
 */
export function compileAndScan(
  contracts: Record<string, string>
): CompileAndScanResult {
  // Step 1: Source code scan (all files combined)
  const allSource = Object.values(contracts).join('\n');
  const sourceReport = scanSourceCode(allSource);

  if (!sourceReport.passed) {
    console.error('[CompileAndScan] Source scan failed:', sourceReport.critical);
    throw new Error(
      'Security scan failed — critical issues found:\n' +
        sourceReport.critical.map((f) => `  ${f.code}: ${f.message}`).join('\n')
    );
  }

  // Step 2: Compile
  const compileResult = compileContracts(contracts);

  // Step 3: Bytecode scan (scan the first/main contract)
  const contractNames = Object.keys(compileResult.contracts);
  const mainContract = compileResult.contracts[contractNames[0]];
  const bytecodeReport = scanBytecode(mainContract.bytecode);

  if (!bytecodeReport.passed) {
    console.error('[CompileAndScan] Bytecode scan failed:', bytecodeReport.critical);
    throw new Error(
      'Bytecode security scan failed — critical issues found:\n' +
        bytecodeReport.critical.map((f) => `  ${f.code}: ${f.message}`).join('\n')
    );
  }

  // Step 4: Integrity hashes
  const integrityHashes = createIntegrityHash(allSource, mainContract.bytecode);

  // Combined security score (average of source + bytecode)
  const securityScore = Math.round((sourceReport.score + bytecodeReport.score) / 2);

  console.log('[CompileAndScan] Security score:', securityScore, 'Hashes:', integrityHashes.combinedHash);

  return {
    success: true,
    contracts: compileResult.contracts,
    warnings: compileResult.warnings,
    sourceReport,
    bytecodeReport,
    integrityHashes,
    securityScore,
  };
}

/**
 * Validate source code before compilation.
 */
export function validateContract(sourceCode: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!sourceCode.includes('SPDX-License-Identifier')) {
    errors.push('Missing SPDX-License-Identifier');
  }
  if (!sourceCode.includes('pragma solidity')) {
    errors.push('Missing pragma solidity statement');
  }
  if (!sourceCode.match(/contract\s+\w+/)) {
    errors.push('No contract definition found');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Estimate deployment gas from bytecode.
 */
export function estimateGas(bytecode: string): number {
  const baseGas = 21000;
  const bytecodeGas = (bytecode.length / 2) * 200;
  return Math.ceil(baseGas + bytecodeGas);
}

/**
 * Import resolver for OpenZeppelin dependencies.
 */
function findImports(importPath: string): { contents?: string; error?: string } {
  try {
    if (importPath.startsWith('@openzeppelin/')) {
      // Try node_modules in this project
      const fullPath = path.join(
        process.cwd(),
        'node_modules',
        importPath
      );
      if (fs.existsSync(fullPath)) {
        return { contents: fs.readFileSync(fullPath, 'utf8') };
      }

      // Try lib/openzeppelin-contracts
      const altPath = path.join(
        process.cwd(),
        'lib',
        'openzeppelin-contracts',
        importPath.replace('@openzeppelin/contracts/', 'contracts/')
      );
      if (fs.existsSync(altPath)) {
        return { contents: fs.readFileSync(altPath, 'utf8') };
      }
    }

    console.warn('[Compile] Import not found:', importPath);
    return { error: 'Import not found: ' + importPath };
  } catch (error) {
    console.error('[Compile] Error resolving import:', importPath, error);
    return { error: 'Failed to resolve import: ' + importPath };
  }
}
