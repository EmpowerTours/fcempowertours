# EmpowerTours Mainnet Launch Checklist

## Monad Mainnet Configuration

| Parameter | Value |
|-----------|-------|
| Chain ID | 143 |
| RPC URL | https://rpc.monad.xyz |
| WebSocket | wss://rpc.monad.xyz |
| Block Explorer | https://monadscan.com |
| WMON Address | 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A |
| EntryPoint v0.7 | 0x0000000071727De22E5E9d8BAf0edAc6f37da032 |

---

## Pre-Launch Checklist

### 1. Security Audit
- [ ] All smart contracts audited by reputable firm
- [ ] Audit report reviewed and all critical issues resolved
- [ ] Re-audit after any significant contract modifications
- [ ] Penetration testing on backend services completed

### 2. Wallet & Key Management
- [ ] Generate NEW deployer wallet for mainnet (NEVER reuse testnet keys)
- [ ] Store deployer private key securely (hardware wallet recommended)
- [ ] Set up multi-sig (Safe) for treasury and admin functions
- [ ] Configure Safe Account for mainnet operations
- [ ] Backup recovery procedures documented and tested

### 3. Funding
- [ ] Fund deployer wallet with sufficient MON (min 10 MON recommended)
- [ ] Estimate gas costs for all contract deployments
- [ ] Fund treasury address for initial operations
- [ ] Prepare initial TOURS token liquidity for AMM

### 4. Smart Contract Preparation
- [ ] All contracts compile without warnings
- [ ] Unit tests pass with 100% coverage on critical paths
- [ ] Integration tests pass on testnet fork
- [ ] Gas optimization completed
- [ ] Update all contract addresses in deployment scripts
- [ ] Verify WMON address: 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A

### 5. Infrastructure
- [ ] Production RPC endpoints configured
- [ ] Fallback RPC endpoints configured
- [ ] Rate limiting and monitoring in place
- [ ] Error alerting configured (PagerDuty, Slack, etc.)
- [ ] Database backups automated
- [ ] Configure Pimlico bundler for mainnet (Chain ID: 143)
- [ ] Update Envio/indexer for mainnet

### 6. Environment Configuration
- [ ] `.env.mainnet` created from `.env.mainnet.example`
- [ ] All API keys rotated from testnet
- [ ] New Pimlico API key for mainnet bundler
- [ ] Production Pinata/IPFS gateway configured
- [ ] WalletConnect project ID updated (optional)

---

## Deployment Order

Deploy contracts in this specific order to resolve dependencies:

1. **TOURS Token** (if not already deployed on mainnet)
2. **NFT Contract** (EmpowerTours NFT)
3. **Passport Contract** (User passport/profile)
4. **Vault Contract** (Staking vault)
5. **Market Contract** (NFT marketplace)
6. **SimpleLiquidityPool** (TOURS/WMON AMM pool)
7. **WMON Unwrap Helper** (Gas-efficient unwrapping)
8. **Yield Strategy** (Yield optimization)
9. **Mini-app Contracts:**
   - Action Based Demand Signal
   - Itinerary NFT
   - Music Beat Match
   - Country Collector
   - Tanda Pool

---

## Deployment Steps

### Step 1: Compile Contracts
```bash
cd /home/empowertours/projects/fcempowertours/contracts
forge clean
forge build
```

### Step 2: Deploy to Mainnet
```bash
export PRIVATE_KEY=your_private_key_here
export PASSPORT_NFT=0x...  # From Step 1-8
export TOURS_TOKEN=0x...
export KEEPER=0x...        # Safe multi-sig
export BACKEND_WALLET=0x...

forge script script/DeployMainnet.s.sol:DeployMainnet \
  --rpc-url https://rpc.monad.xyz \
  --broadcast \
  --verify \
  --verifier-url https://api.monadscan.com/api \
  -vvvv
```

### Step 3: Verify Contracts
```bash
forge verify-contract <CONTRACT_ADDRESS> <CONTRACT_NAME> \
  --chain-id 143 \
  --verifier-url https://api.monadscan.com/api
```

---

## Post-Deployment Checklist

### Contract Verification
- [ ] All contracts verified on MonadScan
- [ ] Test each contract function on mainnet
- [ ] Verify ownership and admin roles
- [ ] Contract source code matches deployment

### Liquidity & Operations
- [ ] Add initial liquidity to TOURS/WMON pool
- [ ] Configure treasury funding
- [ ] Set up bot wallet for automated operations
- [ ] Authorize backend wallet on ActionBasedDemandSignal

### Application Updates
- [ ] Update all contract addresses in `.env.mainnet`
- [ ] Deploy updated frontend to production
- [ ] Test all user flows on mainnet
- [ ] Monitor first transactions

### Monitoring
- [ ] Contract events being indexed correctly
- [ ] User transactions completing successfully
- [ ] No unexpected errors in logs
- [ ] Gas costs within expected range

---

## Emergency Procedures

### Contract Pause
If critical issue discovered:
1. Call `pause()` on affected contracts (if pausable)
2. Notify team immediately
3. Notify users via social channels
4. Investigate and prepare fix
5. Test fix on fork
6. Deploy fix and unpause

### Key Compromise
If private key compromised:
1. Transfer admin rights to backup wallet immediately
2. Pause all affected contracts
3. Rotate all related API keys
4. Revoke all approvals from compromised address
5. Notify users to revoke approvals
6. Investigate breach source
7. Update security procedures

---

## Contract Addresses (Update After Deployment)

| Contract | Address | Verified |
|----------|---------|----------|
| WMON (Protocol) | 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A | N/A |
| EntryPoint (Protocol) | 0x0000000071727De22E5E9d8BAf0edAc6f37da032 | N/A |
| TOURS Token | TBD | [ ] |
| Passport NFT | TBD | [ ] |
| EmpowerTours NFT | TBD | [ ] |
| Market | TBD | [ ] |
| Vault | TBD | [ ] |
| Yield Strategy | TBD | [ ] |
| Action Demand Signal | TBD | [ ] |
| Itinerary NFT | TBD | [ ] |
| Music Beat Match | TBD | [ ] |
| Country Collector | TBD | [ ] |
| Tanda Pool | TBD | [ ] |
| TOURS-WMON Pool | TBD | [ ] |
| WMON Unwrap Helper | TBD | [ ] |
| Safe Account | TBD | [ ] |

---

## Files in This Directory

| File | Purpose |
|------|---------|
| README.md | This launch checklist |
| chain-config.ts | Viem chain definition for Monad Mainnet |
| .env.mainnet.example | Environment variable template |
| deploy-contracts.md | Step-by-step deployment guide |

---

## Resources

- [Monad Documentation](https://docs.monad.xyz)
- [MonadScan Explorer](https://monadscan.com)
- [Foundry Book](https://book.getfoundry.sh)
- [ERC-4337 EntryPoint](https://eips.ethereum.org/EIPS/eip-4337)
- [Safe{Wallet}](https://safe.global)

---

## Important Notes

1. **NEVER** commit private keys or secrets to git
2. **ALWAYS** use fresh wallets for mainnet
3. **ALWAYS** verify contract addresses before interacting
4. **NEVER** rush deployments - double-check everything
5. **ALWAYS** have a rollback plan
6. **NEVER** skip the security audit
