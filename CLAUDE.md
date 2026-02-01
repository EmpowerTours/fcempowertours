# Claude Code Project Instructions

## Project: EmpowerTours / ResonanceLands

This is a **full-stack Next.js 15 application** with blockchain integration. When working on this project, prioritize **backend development** including:

### Primary Focus Areas

1. **API Routes** (`/app/api/`)
   - Next.js API route handlers
   - Blockchain interactions via viem/ethers
   - External API integrations (Neynar, Envio, Google Gemini)

2. **Smart Contracts** (`/contracts/`)
   - Solidity contracts for Monad Mainnet (Chain ID: 143)
   - Foundry testing with `forge test`
   - Contract deployment and verification

3. **Backend Services**
   - Database operations
   - Caching and optimization
   - Background jobs and scheduled tasks

4. **Blockchain Integration**
   - Monad Mainnet (Chain ID: 143)
   - ERC-4337 account abstraction via Pimlico
   - Token contracts: TOURS, WMON, Passports, NFTs

### Key Backend Files

- `/app/api/oracle/chat/route.ts` - AI Oracle with Google Gemini
- `/app/api/execute-delegated/route.ts` - Delegated transactions
- `/app/api/farcaster/` - Farcaster/Neynar integrations
- `/app/api/lands/` - Land registry endpoints
- `/lib/` - Shared utilities and ABIs

### Environment Variables

See `.env.example` for required configuration:
- `NEXT_PUBLIC_MONAD_RPC` - Monad RPC endpoint
- `NEYNAR_API_KEY` - Farcaster API key
- `GEMINI_API_KEY` - Google AI key
- `DEPLOYER_PRIVATE_KEY` - Contract deployer key

### Development Commands

```bash
# Run development server
npm run dev

# Run contract tests
forge test

# Build for production
npm run build
```

### Code Style

- Use TypeScript for all new code
- Use viem for blockchain interactions (preferred over ethers.js)
- Follow Next.js App Router conventions
- Include proper error handling and logging with `[ModuleName]` prefixes
