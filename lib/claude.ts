// lib/claude.ts — Claude AI service for dApp code generation
import Anthropic from '@anthropic-ai/sdk';
import { scanSourceCode, type SecurityReport } from './contract-security';

const MODEL = 'claude-sonnet-4-20250514';

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
  }
  return new Anthropic({ apiKey });
}

interface GeneratedCode {
  contracts: Record<string, string>;
  deploy: Record<string, string>;
  test: Record<string, string>;
  frontend: Record<string, string>;
  readme: string;
}

interface GeneratedMetadata {
  title: string;
  description: string;
  features: string[];
  appType: string;
  rawContent?: string;
}

interface GenerateResult {
  success: boolean;
  code: GeneratedCode;
  metadata: GeneratedMetadata;
  appType: string;
  usage: { inputTokens: number; outputTokens: number };
  cost: { inputTokens: number; outputTokens: number; totalCostUSD: string };
  timestamp: string;
}

/**
 * Generate a full dApp from a natural language prompt.
 */
export async function generateDApp(
  prompt: string,
  appType: string,
  options: { maxTokens?: number } = {}
): Promise<GenerateResult> {
  const client = getClient();

  const systemPrompt = buildSystemPrompt(appType);
  const userPrompt = buildUserPrompt(prompt, appType);

  console.log('[Claude] Generating dApp...', { appType, promptLen: prompt.length });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: options.maxTokens || 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };

  console.log('[Claude] Generation complete. Tokens:', usage);

  const parsed = parseGeneratedCode(text, appType);

  // Claude Sonnet pricing: $3/M input, $15/M output
  const inputCost = (usage.inputTokens / 1_000_000) * 3;
  const outputCost = (usage.outputTokens / 1_000_000) * 15;
  const totalCost = inputCost + outputCost;

  return {
    success: true,
    code: parsed.code,
    metadata: parsed.metadata,
    appType,
    usage,
    cost: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalCostUSD: `$${totalCost.toFixed(4)}`,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate a DAO-governed contract with strict security constraints.
 * Runs security scan after generation; retries once on critical findings.
 */
export async function generateDAOContract(
  prompt: string,
  proposalId: number | string
): Promise<{ success: boolean; code: string; securityReport: SecurityReport; ipfsCID?: string }> {
  const client = getClient();

  const baseSystemPrompt = `You are an expert Solidity developer generating a smart contract for DAO-governed deployment on Monad blockchain.

CRITICAL SECURITY REQUIREMENTS — violations will cause the contract to be rejected:
- NO proxy patterns (no delegatecall, no upgradeable, no ERC1967)
- NO admin keys or owner privileges that bypass governance
- NO upgradeability mechanisms
- NO selfdestruct or delegatecall
- Use Solidity 0.8.20+ with custom errors
- Include ReentrancyGuard where applicable
- All state changes must be protected
- Contract must be fully immutable once deployed
- Use OpenZeppelin battle-tested base contracts where possible
- Target Monad blockchain (EVM-compatible, high performance)

The contract will be reviewed by the community on IPFS before deployment.
DAO Proposal ID: ${proposalId}`;

  const userPrompt = `Generate a production-ready Solidity smart contract based on this description:

${prompt}

Return ONLY the Solidity source code, starting with the SPDX license identifier. No markdown, no explanation, just the contract code.`;

  console.log('[Claude] Generating DAO contract for proposal', proposalId);

  // First attempt
  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: baseSystemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  let code = response.content[0].type === 'text' ? response.content[0].text : '';
  code = code.trim();
  console.log('[Claude] DAO contract generated. Length:', code.length);

  // Run security scan
  let securityReport = scanSourceCode(code);
  console.log('[Claude] Security scan:', { passed: securityReport.passed, score: securityReport.score, criticals: securityReport.critical.length });

  // If critical issues found, retry once with stricter prompt
  if (!securityReport.passed && securityReport.critical.length > 0) {
    console.log('[Claude] Critical issues detected, retrying with stricter prompt...');
    const violations = securityReport.critical.map((f) => `- ${f.code}: ${f.message}`).join('\n');

    const stricterSystem = `${baseSystemPrompt}

PREVIOUS GENERATION WAS REJECTED due to these security violations:
${violations}

You MUST NOT include any of these patterns. Generate a clean, secure contract.`;

    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: stricterSystem,
      messages: [{ role: 'user', content: userPrompt }],
    });

    code = response.content[0].type === 'text' ? response.content[0].text : '';
    code = code.trim();
    console.log('[Claude] Retry generation complete. Length:', code.length);

    securityReport = scanSourceCode(code);
    console.log('[Claude] Retry security scan:', { passed: securityReport.passed, score: securityReport.score });
  }

  return { success: securityReport.passed, code, securityReport };
}

// -- Internal helpers --

function buildSystemPrompt(appType: string): string {
  const base = `You are an expert Solidity and Web3 developer specializing in Monad blockchain development.

CRITICAL REQUIREMENTS:
- Generate production-ready, secure, and gas-optimized code
- Use Solidity 0.8.20+ with custom errors for gas efficiency
- Include ReentrancyGuard and access control where needed
- All contracts must compile and be deployment-ready
- Include comprehensive inline documentation
- Follow best practices and security patterns
- Target Monad blockchain (EVM-compatible, high performance)`;

  const typeSpecific: Record<string, string> = {
    'VRF Game': `
ADDITIONAL REQUIREMENTS FOR VRF GAMES:
- Integrate Pyth Entropy VRF for verifiable randomness
- Use commit-reveal pattern for fairness
- Include proper game state management
- Add emergency pause functionality
- Implement player rewards and payouts securely
- Include frontend React code with ethers.js v6
- Add tests using Hardhat and Chai`,
    'NFT Platform': `
ADDITIONAL REQUIREMENTS FOR NFT PLATFORMS:
- Use ERC721A for gas-efficient batch minting
- Include royalty support (ERC2981)
- Add metadata with IPFS integration
- Implement whitelist/allowlist if needed
- Include marketplace functionality
- Add frontend React code with ethers.js v6
- Include comprehensive tests`,
    'DeFi Protocol': `
ADDITIONAL REQUIREMENTS FOR DEFI:
- Use battle-tested patterns (Compound, Uniswap-inspired)
- Include oracle integration for price feeds
- Implement emergency shutdown mechanisms
- Add comprehensive slippage protection
- Include detailed economic parameters
- Add frontend React code with ethers.js v6
- Include thorough test coverage`,
    'DAO': `
ADDITIONAL REQUIREMENTS FOR DAO:
- Implement Governor Bravo or similar governance
- Include timelock for executed proposals
- Add delegation and voting power tracking
- Implement proposal thresholds and quorum
- Include treasury management
- Add frontend React code with ethers.js v6
- Include governance tests`,
    'Token': `
ADDITIONAL REQUIREMENTS FOR TOKENS:
- Use OpenZeppelin ERC20/ERC721 base
- Include proper access control
- Add burn/mint capabilities if needed
- Implement transfer restrictions if needed
- Include vesting schedules if applicable
- Add frontend React code with ethers.js v6
- Include token economics tests`,
  };

  return base + (typeSpecific[appType] || typeSpecific['NFT Platform']);
}

function buildUserPrompt(prompt: string, appType: string): string {
  return `Generate a complete ${appType} application for Monad blockchain based on this description:

${prompt}

DELIVERABLES:
1. Smart contract(s) in Solidity 0.8.20+
2. Hardhat deployment script
3. Frontend React app with ethers.js v6 integration
4. Comprehensive test suite
5. README with setup instructions

Return ONLY valid code in this JSON structure:
{
  "contracts": {
    "Main.sol": "<solidity code>",
    "Helper.sol": "<solidity code if needed>"
  },
  "deploy": {
    "001_deploy.js": "<hardhat deploy script>"
  },
  "test": {
    "Main.test.js": "<hardhat tests>"
  },
  "frontend": {
    "App.js": "<react component>",
    "contract.js": "<ethers.js integration>"
  },
  "README.md": "<setup instructions>",
  "metadata": {
    "title": "<app name>",
    "description": "<brief description>",
    "features": ["<feature 1>", "<feature 2>"]
  }
}`;
}

function parseGeneratedCode(
  content: string,
  appType: string
): { code: GeneratedCode; metadata: GeneratedMetadata } {
  try {
    let cleaned = content.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/```\n?/g, '');
    }

    const parsed = JSON.parse(cleaned);

    return {
      code: {
        contracts: parsed.contracts || {},
        deploy: parsed.deploy || {},
        test: parsed.test || {},
        frontend: parsed.frontend || {},
        readme: parsed['README.md'] || parsed.README || '',
      },
      metadata: {
        title: parsed.metadata?.title || `Generated ${appType}`,
        description: parsed.metadata?.description || '',
        features: parsed.metadata?.features || [],
        appType,
      },
    };
  } catch {
    console.error('[Claude] Failed to parse output as JSON, returning raw');
    return {
      code: {
        contracts: {},
        deploy: {},
        test: {},
        frontend: {},
        readme: content,
      },
      metadata: {
        title: `Generated ${appType}`,
        description: 'Generated code — manual parsing required',
        features: [],
        appType,
        rawContent: content,
      },
    };
  }
}
