// lib/contract-security.ts — Security scanning module for contract deployment pipeline
import crypto from 'crypto';

// ============================================
// Types
// ============================================

export type FindingSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type ScanType = 'source' | 'bytecode' | 'combined';

export interface SecurityFinding {
  severity: FindingSeverity;
  code: string;
  message: string;
  line?: number;
}

export interface SecurityReport {
  passed: boolean;
  critical: SecurityFinding[];
  warnings: SecurityFinding[];
  info: SecurityFinding[];
  scanType: ScanType;
  timestamp: string;
  score: number;
}

export interface IntegrityHashes {
  sourceHash: string;
  bytecodeHash: string;
  combinedHash: string;
}

// ============================================
// Forbidden Patterns — Source Code
// ============================================

interface PatternRule {
  pattern: RegExp;
  severity: FindingSeverity;
  code: string;
  message: string;
}

const SOURCE_PATTERNS: PatternRule[] = [
  // CRITICAL — block deployment
  {
    pattern: /\bselfdestruct\s*\(/i,
    severity: 'CRITICAL',
    code: 'SELFDESTRUCT',
    message: 'selfdestruct is forbidden — contract must be immutable',
  },
  {
    pattern: /\bsuicide\s*\(/i,
    severity: 'CRITICAL',
    code: 'SUICIDE',
    message: 'suicide (deprecated selfdestruct) is forbidden',
  },
  {
    pattern: /\bdelegatecall\s*\(/i,
    severity: 'CRITICAL',
    code: 'DELEGATECALL',
    message: 'delegatecall is forbidden — no proxy patterns allowed',
  },
  {
    pattern: /\bcallcode\s*\(/i,
    severity: 'CRITICAL',
    code: 'CALLCODE',
    message: 'callcode is forbidden — deprecated and unsafe',
  },
  {
    pattern: /\bERC1967\b/,
    severity: 'CRITICAL',
    code: 'ERC1967_PROXY',
    message: 'ERC1967 proxy pattern is forbidden — contracts must be immutable',
  },
  {
    pattern: /\bUUPS\b/,
    severity: 'CRITICAL',
    code: 'UUPS_PROXY',
    message: 'UUPS upgradeable pattern is forbidden',
  },
  {
    pattern: /\bTransparentProxy\b/,
    severity: 'CRITICAL',
    code: 'TRANSPARENT_PROXY',
    message: 'TransparentProxy pattern is forbidden',
  },
  {
    pattern: /import\s+.*[Pp]roxy/,
    severity: 'CRITICAL',
    code: 'PROXY_IMPORT',
    message: 'Proxy contract import detected — upgradeable contracts forbidden',
  },
  {
    pattern: /\bis\s+.*Proxy\b/,
    severity: 'CRITICAL',
    code: 'PROXY_INHERITANCE',
    message: 'Proxy inheritance detected — upgradeable contracts forbidden',
  },
  {
    pattern: /import\s+.*[Uu]pgradeable/,
    severity: 'CRITICAL',
    code: 'UPGRADEABLE_IMPORT',
    message: 'Upgradeable contract import detected — contracts must be immutable',
  },

  // WARNING
  {
    pattern: /\btx\.origin\b/,
    severity: 'WARNING',
    code: 'TX_ORIGIN',
    message: 'tx.origin usage detected — vulnerable to phishing attacks, use msg.sender instead',
  },
  {
    pattern: /assembly\s*\{[^}]*\bcreate2\b/s,
    severity: 'WARNING',
    code: 'ASSEMBLY_CREATE2',
    message: 'Assembly create2 detected — review for counterfactual deployment safety',
  },

  // INFO
  {
    pattern: /pragma\s+solidity\s+([^;]+)/,
    severity: 'INFO',
    code: 'SOLIDITY_VERSION',
    message: '', // filled dynamically
  },
];

// ============================================
// Source Code Scanner
// ============================================

/**
 * Scan Solidity source code for forbidden patterns and security issues.
 */
export function scanSourceCode(code: string): SecurityReport {
  const critical: SecurityFinding[] = [];
  const warnings: SecurityFinding[] = [];
  const info: SecurityFinding[] = [];
  const lines = code.split('\n');

  // Run pattern checks
  for (const rule of SOURCE_PATTERNS) {
    if (rule.code === 'SOLIDITY_VERSION') {
      const match = code.match(rule.pattern);
      if (match) {
        info.push({
          severity: 'INFO',
          code: 'SOLIDITY_VERSION',
          message: `Solidity version detected: ${match[1].trim()}`,
        });
      }
      continue;
    }

    // Find line number for the match
    for (let i = 0; i < lines.length; i++) {
      if (rule.pattern.test(lines[i])) {
        const finding: SecurityFinding = {
          severity: rule.severity,
          code: rule.code,
          message: rule.message,
          line: i + 1,
        };

        if (rule.severity === 'CRITICAL') critical.push(finding);
        else if (rule.severity === 'WARNING') warnings.push(finding);
        else info.push(finding);
        break; // One finding per pattern is enough
      }
    }

    // For multiline patterns, check whole source if not found per-line
    if (rule.pattern.flags.includes('s') && rule.pattern.test(code)) {
      const alreadyFound =
        critical.some((f) => f.code === rule.code) ||
        warnings.some((f) => f.code === rule.code);
      if (!alreadyFound) {
        const finding: SecurityFinding = {
          severity: rule.severity,
          code: rule.code,
          message: rule.message,
        };
        if (rule.severity === 'CRITICAL') critical.push(finding);
        else if (rule.severity === 'WARNING') warnings.push(finding);
        else info.push(finding);
      }
    }
  }

  // Check pragma version >= 0.8.20
  const pragmaMatch = code.match(/pragma\s+solidity\s+[\^>=]*\s*(0\.\d+\.\d+)/);
  if (pragmaMatch) {
    const version = pragmaMatch[1];
    const [, minor, patch] = version.split('.').map(Number);
    if (minor < 8 || (minor === 8 && patch < 20)) {
      critical.push({
        severity: 'CRITICAL',
        code: 'OLD_SOLIDITY',
        message: `Solidity version ${version} is below minimum 0.8.20 — upgrade required`,
      });
    }
  } else if (!code.includes('pragma solidity')) {
    critical.push({
      severity: 'CRITICAL',
      code: 'NO_PRAGMA',
      message: 'No pragma solidity statement found',
    });
  }

  // Check for ReentrancyGuard usage when external calls present
  const hasExternalCalls = /\.call\s*\{|\.transfer\s*\(|\.send\s*\(/.test(code);
  const hasReentrancyGuard = /ReentrancyGuard/.test(code);
  if (hasExternalCalls && !hasReentrancyGuard) {
    warnings.push({
      severity: 'WARNING',
      code: 'MISSING_REENTRANCY_GUARD',
      message: 'Contract has external calls but does not use ReentrancyGuard',
    });
  }

  // Contract size heuristic (source code length)
  const sourceBytes = Buffer.byteLength(code, 'utf8');
  if (sourceBytes > 50000) {
    info.push({
      severity: 'INFO',
      code: 'LARGE_SOURCE',
      message: `Source code is ${(sourceBytes / 1024).toFixed(1)}KB — may produce large bytecode`,
    });
  }

  const score = computeSecurityScore({ critical, warnings, info });

  return {
    passed: critical.length === 0,
    critical,
    warnings,
    info,
    scanType: 'source',
    timestamp: new Date().toISOString(),
    score,
  };
}

// ============================================
// Bytecode Scanner
// ============================================

// EVM opcode constants for dangerous operations
const OPCODE_SELFDESTRUCT = 0xff;
const OPCODE_DELEGATECALL = 0xf4;
const OPCODE_CALLCODE = 0xf2;

// PUSH opcodes: PUSH1 (0x60) through PUSH32 (0x7f)
const PUSH1 = 0x60;
const PUSH32 = 0x7f;

// EIP-170: max deployed contract size
const MAX_BYTECODE_SIZE = 24576;

/**
 * Scan compiled bytecode for forbidden opcodes using context-aware opcode walk.
 * Skips PUSH data bytes to avoid false positives.
 */
export function scanBytecode(bytecode: string): SecurityReport {
  const critical: SecurityFinding[] = [];
  const warnings: SecurityFinding[] = [];
  const info: SecurityFinding[] = [];

  // Normalize bytecode
  let hex = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
  const bytes = Buffer.from(hex, 'hex');

  // Size check (EIP-170)
  if (bytes.length > MAX_BYTECODE_SIZE) {
    critical.push({
      severity: 'CRITICAL',
      code: 'BYTECODE_TOO_LARGE',
      message: `Bytecode size ${bytes.length} exceeds EIP-170 limit of ${MAX_BYTECODE_SIZE} bytes`,
    });
  }

  info.push({
    severity: 'INFO',
    code: 'BYTECODE_SIZE',
    message: `Bytecode size: ${bytes.length} bytes (${((bytes.length / MAX_BYTECODE_SIZE) * 100).toFixed(1)}% of EIP-170 limit)`,
  });

  // Context-aware opcode walk — skip PUSH data bytes
  let i = 0;
  while (i < bytes.length) {
    const opcode = bytes[i];

    // Check for PUSH opcodes and skip their data
    if (opcode >= PUSH1 && opcode <= PUSH32) {
      const pushSize = opcode - PUSH1 + 1;
      i += 1 + pushSize; // skip opcode + data bytes
      continue;
    }

    // Check forbidden opcodes
    if (opcode === OPCODE_SELFDESTRUCT) {
      critical.push({
        severity: 'CRITICAL',
        code: 'OPCODE_SELFDESTRUCT',
        message: `SELFDESTRUCT opcode (0xFF) found at byte offset ${i}`,
      });
    } else if (opcode === OPCODE_DELEGATECALL) {
      critical.push({
        severity: 'CRITICAL',
        code: 'OPCODE_DELEGATECALL',
        message: `DELEGATECALL opcode (0xF4) found at byte offset ${i}`,
      });
    } else if (opcode === OPCODE_CALLCODE) {
      critical.push({
        severity: 'CRITICAL',
        code: 'OPCODE_CALLCODE',
        message: `CALLCODE opcode (0xF2) found at byte offset ${i}`,
      });
    }

    i++;
  }

  const score = computeSecurityScore({ critical, warnings, info });

  return {
    passed: critical.length === 0,
    critical,
    warnings,
    info,
    scanType: 'bytecode',
    timestamp: new Date().toISOString(),
    score,
  };
}

// ============================================
// Integrity Hashing
// ============================================

/**
 * Create SHA-256 integrity hashes for source and bytecode.
 */
export function createIntegrityHash(
  source: string,
  bytecode: string
): IntegrityHashes {
  const sourceHash = crypto
    .createHash('sha256')
    .update(source)
    .digest('hex');

  const normalizedBytecode = bytecode.startsWith('0x')
    ? bytecode.slice(2)
    : bytecode;
  const bytecodeHash = crypto
    .createHash('sha256')
    .update(normalizedBytecode)
    .digest('hex');

  const combinedHash = crypto
    .createHash('sha256')
    .update(sourceHash + bytecodeHash)
    .digest('hex');

  return {
    sourceHash: '0x' + sourceHash,
    bytecodeHash: '0x' + bytecodeHash,
    combinedHash: '0x' + combinedHash,
  };
}

// ============================================
// Security Score
// ============================================

/**
 * Compute a 0-100 security score based on findings.
 * -50 per critical, -10 per warning, -2 per info.
 */
export function computeSecurityScore(findings: {
  critical: SecurityFinding[];
  warnings: SecurityFinding[];
  info: SecurityFinding[];
}): number {
  let score = 100;
  score -= findings.critical.length * 50;
  score -= findings.warnings.length * 10;
  score -= findings.info.length * 2;
  return Math.max(0, Math.min(100, score));
}
