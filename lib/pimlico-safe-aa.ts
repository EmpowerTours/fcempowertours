import {
  createSmartAccountClient,
  SmartAccountClient,
} from 'permissionless';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { createPublicClient, createWalletClient, http, Address, Hex, parseAbi, parseEther, encodePacked, concat, toHex } from 'viem';
import { entryPoint07Address } from 'viem/account-abstraction';
import { monadMainnet } from '@/app/chains';
import { privateKeyToAccount, sign } from 'viem/accounts';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { env } from '@/lib/env';

// Monad Mainnet (Chain ID: 143)
const currentChain = monadMainnet;

const PIMLICO_API_KEY = env.PIMLICO_API_KEY;
const PIMLICO_BUNDLER_URL = env.PIMLICO_BUNDLER_URL;
const ENTRYPOINT_ADDRESS = env.ENTRYPOINT_ADDRESS as Address;
const SAFE_ACCOUNT = env.SAFE_ACCOUNT as Address;

// Public client for Monad (mainnet or testnet based on CHAIN_ID)
export const publicClient = createPublicClient({
  chain: currentChain,
  transport: http(env.MONAD_RPC),
});

// Lazy initialization for Safe owner account (only when actually needed at runtime)
let _safeOwnerAccount: ReturnType<typeof privateKeyToAccount> | null = null;

function getSafeOwnerAccount() {
  if (!_safeOwnerAccount) {
    const SAFE_OWNER_PRIVATE_KEY = process.env.SAFE_OWNER_PRIVATE_KEY as `0x${string}`;
    if (!SAFE_OWNER_PRIVATE_KEY) {
      throw new Error('SAFE_OWNER_PRIVATE_KEY is not set');
    }
    console.log('🔐 Initializing Safe AA Client (EntryPoint v0.7)');
    console.log('   EntryPoint:', ENTRYPOINT_ADDRESS);
    console.log('   Safe Account:', SAFE_ACCOUNT);
    console.log('   Bundler:', PIMLICO_BUNDLER_URL);
    _safeOwnerAccount = privateKeyToAccount(SAFE_OWNER_PRIVATE_KEY);
    console.log('✅ Safe owner account:', _safeOwnerAccount.address);
  }
  return _safeOwnerAccount;
}

// Create Smart Account Client for Safe + AA
export async function createSafeSmartAccountClient(): Promise<SmartAccountClient> {
  console.log('📝 Creating Smart Account Client for Safe...');
  try {
    const safeOwnerAccount = getSafeOwnerAccount();
    const safeSmartAccount = await toSafeSmartAccount({
      client: publicClient,
      owners: [safeOwnerAccount],
      entryPoint: {
        address: ENTRYPOINT_ADDRESS,
        version: '0.7', // ✅ Using v0.7 to match Pimlico bundler
      },
      version: '1.4.1',
      address: SAFE_ACCOUNT,
      saltNonce: 0n,
    });

    // Pimlico client for gas price estimation (NOT as paymaster - Safe pays its own gas)
    const pimlicoClient = createPimlicoClient({
      transport: http(PIMLICO_BUNDLER_URL),
      entryPoint: {
        address: entryPoint07Address,
        version: '0.7',
      },
    });

    const smartAccountClient = createSmartAccountClient({
      account: safeSmartAccount,
      chain: currentChain,
      bundlerTransport: http(PIMLICO_BUNDLER_URL, { timeout: 120000 }),
      // NO paymaster - Safe pays its own gas from its MON balance (168+ MON)
      // This matches User Safe behavior and avoids Pimlico paymaster balance issues
      userOperation: {
        estimateFeesPerGas: async () => {
          return (await pimlicoClient.getUserOperationGasPrice()).fast;
        },
      },
    });

    // Debug logging - non-fatal if Safe isn't properly deployed
    try {
      const modulesAbi = parseAbi([
        'function getModulesPaginated(address start, uint256 pageSize) external view returns (address[] array, address next)',
      ]);
      const [modules] = await publicClient.readContract({
        address: SAFE_ACCOUNT,
        abi: modulesAbi,
        functionName: 'getModulesPaginated',
        args: ['0x0000000000000000000000000000000000000001' as Address, 10n],
      });
      console.log('   Enabled modules:', modules);

      const FALLBACK_HANDLER_STORAGE_SLOT = '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5';
      const storageValue = await publicClient.getStorageAt({
        address: SAFE_ACCOUNT,
        slot: FALLBACK_HANDLER_STORAGE_SLOT as `0x${string}`,
      });
      const fallbackHandler = storageValue
        ? ('0x' + storageValue.slice(-40)) as `0x${string}`
        : '0x0000000000000000000000000000000000000000';
      console.log('   Fallback handler:', fallbackHandler);
    } catch (debugError) {
      console.warn('   ⚠️ Could not read Safe modules (Safe may not be deployed)');
    }

    console.log('✅ Smart Account Client created with EntryPoint v0.7');
    return smartAccountClient;
  } catch (error: any) {
    console.error('❌ Error creating Smart Account Client:', error.message);
    throw error;
  }
}

// ✅ NEW: Helper function to fetch gas prices from Pimlico
async function getPimlicoGasPrices(): Promise<{
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}> {
  try {
    console.log('⛽ Fetching gas prices from Pimlico...');
    
    const response = await fetch(PIMLICO_BUNDLER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'pimlico_getUserOperationGasPrice',
        params: [],
      }),
    });

    if (!response.ok) {
      throw new Error(`Pimlico API returned ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Pimlico error: ${data.error.message}`);
    }

    // Pimlico returns gas prices in "fast", "standard", and "slow" tiers
    // Use "fast" for better chances of inclusion
    const { fast } = data.result;
    const maxFeePerGas = BigInt(fast.maxFeePerGas);
    const maxPriorityFeePerGas = BigInt(fast.maxPriorityFeePerGas);

    console.log('✅ Pimlico gas prices (fast tier):', {
      maxFeePerGas: maxFeePerGas.toString() + ' wei',
      maxPriorityFeePerGas: maxPriorityFeePerGas.toString() + ' wei',
    });

    return { maxFeePerGas, maxPriorityFeePerGas };
  } catch (error: any) {
    console.error('❌ Failed to fetch Pimlico gas prices:', error.message);
    
    // Fallback: use chain's gas price with 50% buffer (minimum Pimlico requirement)
    console.warn('⚠️ Falling back to chain gas price with 50% buffer...');
    const gasPrice = await publicClient.getGasPrice();
    const maxFeePerGas = (gasPrice * 150n) / 100n; // 50% buffer
    const maxPriorityFeePerGas = gasPrice / 10n;
    
    console.log('⚠️ Fallback gas prices:', {
      chainGasPrice: gasPrice.toString(),
      maxFeePerGas: maxFeePerGas.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
    });
    
    return { maxFeePerGas, maxPriorityFeePerGas };
  }
}

export async function sendSafeTransaction(
  calls: Array<{ to: Address; value: bigint; data: Hex }>
) {
  try {
    console.log('📤 Sending batched transaction through Safe SmartAccount...');
    console.log('📦 Number of calls:', calls.length);
    console.log('📋 Call details:', JSON.stringify(calls.map((c, idx) => ({
      index: idx,
      to: c.to,
      value: c.value.toString(),
      dataLength: c.data.length,
      // Extract function selector (first 4 bytes) for debugging
      functionSelector: c.data.slice(0, 10),
      // Show full data for debugging (truncated if too long)
      data: c.data.length > 200 ? c.data.slice(0, 200) + '...' : c.data
    })), null, 2));

    const smartAccountClient = await createSafeSmartAccountClient();

    if (!smartAccountClient.account) {
      throw new Error('Failed to create smart account client - account is undefined');
    }

    console.log('🔍 Account details:', {
      address: smartAccountClient.account.address,
      entryPoint: smartAccountClient.account.entryPoint.address,
      entryPointVersion: smartAccountClient.account.entryPoint.version,
    });

    // Check if EntryPoint is deployed
    console.log('🔍 Checking if EntryPoint is deployed...');
    const entryPointCode = await publicClient.getCode({ address: ENTRYPOINT_ADDRESS });
    if (!entryPointCode || entryPointCode === '0x') {
      throw new Error(
        `EntryPoint ${ENTRYPOINT_ADDRESS} is NOT deployed on chain ${currentChain.id}! ` +
        `ERC-4337 EntryPoint v0.7 must be deployed before using Account Abstraction. ` +
        `Either deploy the EntryPoint or use a different AA solution.`
      );
    }
    console.log('✅ EntryPoint is deployed (code length: ' + entryPointCode.length + ')');

    // Check if account is deployed
    console.log('🔍 Checking if Safe account is deployed...');
    const accountCode = await publicClient.getCode({ address: SAFE_ACCOUNT });
    if (!accountCode || accountCode === '0x') {
      throw new Error(`Safe account ${SAFE_ACCOUNT} is NOT deployed! Deploy it first before using AA.`);
    }
    console.log('✅ Safe account is deployed (code length: ' + accountCode.length + ')');

    // Check Safe balance and warn if low
    const safeBalance = await publicClient.getBalance({ address: SAFE_ACCOUNT });
    const currentBalanceMON = (Number(safeBalance) / 1e18).toFixed(4);
    console.log('💰 Safe MON balance:', currentBalanceMON, 'MON');

    // ⚠️ CRITICAL: Pimlico bundler requires reserve balances that vary based on:
    // - Current gas prices on the network
    // - Complexity of the UserOperation (simple call vs. batched operations)
    // - Type of operation (value transfers need more)
    // Based on production data, requirements are:
    const ABSOLUTE_MINIMUM_BALANCE = parseEther('3'); // Will likely fail below this
    const RECOMMENDED_BALANCE = parseEther('5');      // Safe for most operations
    const OPTIMAL_BALANCE = parseEther('10');         // Recommended for reliable 24/7 operations

    if (safeBalance < ABSOLUTE_MINIMUM_BALANCE) {
      const requiredMON = (Number(ABSOLUTE_MINIMUM_BALANCE) / 1e18).toFixed(1);
      const deficitMON = Math.max(0, parseFloat(requiredMON) - parseFloat(currentBalanceMON)).toFixed(4);

      throw new Error(
        `Safe account balance too low for Pimlico operations.\n\n` +
        `Current balance: ${currentBalanceMON} MON\n` +
        `Absolute minimum: ${requiredMON} MON\n` +
        `Deficit: ${deficitMON} MON needed\n\n` +
        `Safe address: ${SAFE_ACCOUNT}\n\n` +
        `Please fund the Safe wallet before attempting transactions.\n` +
        `Recommended: Send 5-10 MON for reliable operation.\n` +
        `Please fund the Safe wallet with MON.`
      );
    }

    // Warn if balance is below recommended (but don't fail - let bundler decide)
    if (safeBalance < RECOMMENDED_BALANCE) {
      const recommendedMON = (Number(RECOMMENDED_BALANCE) / 1e18).toFixed(1);
      const deficitMON = Math.max(0, parseFloat(recommendedMON) - parseFloat(currentBalanceMON)).toFixed(4);

      console.warn(`⚠️  WARNING: Safe balance is below recommended threshold`);
      console.warn(`   Current: ${currentBalanceMON} MON`);
      console.warn(`   Recommended: ${recommendedMON} MON`);
      console.warn(`   Deficit: ${deficitMON} MON`);
      console.warn(`   This transaction may fail with "reserve balance check" errors.`);
      console.warn(`   Please consider funding the Safe wallet soon.`);
    } else if (safeBalance < OPTIMAL_BALANCE) {
      console.log(`ℹ️  Safe balance is adequate but could be higher for 24/7 operations`);
      console.log(`   Current: ${currentBalanceMON} MON`);
      console.log(`   Optimal: 10+ MON for continuous automation`);
    } else {
      console.log(`✅ Safe balance is healthy for continuous operations`);
    }

    // ✅ ENHANCED: Analyze each call and validate its preconditions
    console.log('🔍 Validating preconditions for each call...');
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const functionSelector = call.data.slice(0, 10);

      console.log(`   [Call ${i}] Target: ${call.to}`);
      console.log(`   [Call ${i}] Function selector: ${functionSelector}`);
      console.log(`   [Call ${i}] Value: ${call.value.toString()}`);

      // Decode common function selectors to understand what's being called
      if (functionSelector === '0x095ea7b3') {
        // approve(address spender, uint256 amount)
        const spender = '0x' + call.data.slice(34, 74);
        const amount = BigInt('0x' + call.data.slice(74, 138));
        console.log(`   [Call ${i}] Type: ERC20 approve`);
        console.log(`   [Call ${i}] Spender: ${spender}`);
        console.log(`   [Call ${i}] Amount: ${amount.toString()}`);

        // ✅ FIX: For approve operations, we should NOT check if balance >= approval amount
        // Approve doesn't transfer tokens, it just grants permission
        // The actual balance check should happen on the spend operation (next call in batch)
        // Only check balance if this is NOT a max approval (max approval = unlimited permission)
        const MAX_UINT256 = 2n ** 256n - 1n;
        const isMaxApproval = amount >= MAX_UINT256 - 1000n; // Allow small margin for different max values

        if (isMaxApproval) {
          console.log(`   [Call ${i}] ℹ️  Max approval detected - skipping balance check`);
          console.log(`   [Call ${i}] Note: Actual spend amount will be validated in the next call`);
        } else {
          // For non-max approvals, check if Safe has enough tokens
          try {
            const tokenAddress = call.to;
            const balance = await publicClient.readContract({
              address: tokenAddress,
              abi: parseAbi(['function balanceOf(address) external view returns (uint256)']),
              functionName: 'balanceOf',
              args: [SAFE_ACCOUNT],
            });
            console.log(`   [Call ${i}] Safe's token balance: ${balance.toString()}`);

            if (balance < amount) {
              console.warn(`   [Call ${i}] ⚠️  Approving ${amount} but Safe only has ${balance}`);
              console.warn(`   [Call ${i}] This is OK for approve operations, but may fail on actual spend`);
            } else {
              console.log(`   [Call ${i}] ✅ Safe has sufficient balance for approval amount`);
            }
          } catch (balanceErr: any) {
            console.error(`   [Call ${i}] ⚠️  Balance check failed:`, balanceErr.message);
          }
        }
      } else if (functionSelector === '0xb438aa31') {
        // stakeWithDeposit(address nftAddress, uint256 nftTokenId, uint256 toursAmount, address beneficiary)
        console.log(`   [Call ${i}] Type: stakeWithDeposit`);
        const nftAddress = '0x' + call.data.slice(34, 74);
        const nftTokenId = BigInt('0x' + call.data.slice(74, 138));
        const toursAmount = BigInt('0x' + call.data.slice(138, 202));
        const beneficiary = '0x' + call.data.slice(226, 266);

        console.log(`   [Call ${i}] NFT Address: ${nftAddress}`);
        console.log(`   [Call ${i}] NFT Token ID: ${nftTokenId.toString()}`);
        console.log(`   [Call ${i}] TOURS Amount: ${toursAmount.toString()}`);
        console.log(`   [Call ${i}] Beneficiary: ${beneficiary}`);

        // Check if NFT is whitelisted in YieldStrategy
        try {
          const yieldStrategyAddress = call.to;
          const isAccepted = await publicClient.readContract({
            address: yieldStrategyAddress,
            abi: parseAbi(['function acceptedNFTs(address) external view returns (bool)']),
            functionName: 'acceptedNFTs',
            args: [nftAddress as Address],
          });
          console.log(`   [Call ${i}] NFT whitelisted in YieldStrategy: ${isAccepted}`);

          if (!isAccepted) {
            throw new Error(`NFT address ${nftAddress} is not whitelisted in YieldStrategy. The NFT contract must be added to the whitelist before staking. Please contact support.`);
          }
          console.log(`   [Call ${i}] ✅ NFT is whitelisted`);
        } catch (whitelistErr: any) {
          console.error(`   [Call ${i}] ❌ NFT whitelist check failed:`, whitelistErr.message);
          throw new Error(`NFT whitelist validation failed: ${whitelistErr.message}`);
        }

        // Check if beneficiary owns the NFT
        try {
          const nftOwner = await publicClient.readContract({
            address: nftAddress as Address,
            abi: parseAbi(['function ownerOf(uint256 tokenId) external view returns (address)']),
            functionName: 'ownerOf',
            args: [nftTokenId],
          });
          console.log(`   [Call ${i}] NFT owner: ${nftOwner}`);

          if (nftOwner.toLowerCase() !== beneficiary.toLowerCase()) {
            throw new Error(`Beneficiary ${beneficiary} does not own NFT #${nftTokenId} (owned by ${nftOwner})`);
          }
          console.log(`   [Call ${i}] ✅ Beneficiary owns the NFT`);
        } catch (ownerErr: any) {
          console.error(`   [Call ${i}] ❌ NFT ownership check failed:`, ownerErr.message);
          throw new Error(`NFT ownership validation failed: ${ownerErr.message}`);
        }

        // Check if NFT is already used as collateral
        try {
          const yieldStrategyAddress = call.to;
          const isUsed = await publicClient.readContract({
            address: yieldStrategyAddress,
            abi: parseAbi(['function nftCollateralUsed(address, uint256) external view returns (bool)']),
            functionName: 'nftCollateralUsed',
            args: [nftAddress as Address, nftTokenId],
          });
          console.log(`   [Call ${i}] NFT already used as collateral: ${isUsed}`);

          if (isUsed) {
            throw new Error(`NFT #${nftTokenId} is already being used as collateral in another staking position. You cannot stake with the same NFT twice.`);
          }
          console.log(`   [Call ${i}] ✅ NFT is available for staking`);
        } catch (collateralErr: any) {
          console.error(`   [Call ${i}] ❌ NFT collateral check failed:`, collateralErr.message);
          throw new Error(`NFT collateral validation failed: ${collateralErr.message}`);
        }

        // ✅ NEW: Check if YieldStrategy has approval to manage the NFT
        // Only check when beneficiary is the Safe (i.e., not a delegated stake)
        // In delegated scenarios, the beneficiary must approve their NFT before calling stake
        try {
          const yieldStrategyAddress = call.to;
          const isSafeBeneficiary = beneficiary.toLowerCase() === SAFE_ACCOUNT.toLowerCase();

          if (!isSafeBeneficiary) {
            console.log(`   [Call ${i}] ⚠️  Skipping NFT approval check - beneficiary (${beneficiary}) is not the Safe`);
            console.log(`   [Call ${i}] Note: In delegated staking, the beneficiary must have pre-approved the YieldStrategy`);
            console.log(`   [Call ${i}] The contract will validate approval during execution`);
          } else {
            // Check if beneficiary has approved YieldStrategy for this specific token
            const approvedAddress = await publicClient.readContract({
              address: nftAddress as Address,
              abi: parseAbi(['function getApproved(uint256 tokenId) external view returns (address)']),
              functionName: 'getApproved',
              args: [nftTokenId],
            });
            console.log(`   [Call ${i}] NFT approved address: ${approvedAddress}`);

            // Also check if beneficiary has set approval for all to YieldStrategy
            const isApprovedForAll = await publicClient.readContract({
              address: nftAddress as Address,
              abi: parseAbi(['function isApprovedForAll(address owner, address operator) external view returns (bool)']),
              functionName: 'isApprovedForAll',
              args: [beneficiary as Address, yieldStrategyAddress],
            });
            console.log(`   [Call ${i}] NFT approved for all: ${isApprovedForAll}`);

            const hasApproval =
              approvedAddress.toLowerCase() === yieldStrategyAddress.toLowerCase() ||
              isApprovedForAll;

            if (!hasApproval) {
              throw new Error(
                `YieldStrategy does not have approval to manage NFT #${nftTokenId}. ` +
                `The Safe (${SAFE_ACCOUNT}) needs to approve the YieldStrategy contract (${yieldStrategyAddress}) ` +
                `to transfer/manage the NFT before staking. ` +
                `This can be done by calling: NFT.approve(yieldStrategy, tokenId) or NFT.setApprovalForAll(yieldStrategy, true)`
              );
            }
            console.log(`   [Call ${i}] ✅ YieldStrategy has approval for NFT`);
          }
        } catch (approvalErr: any) {
          console.error(`   [Call ${i}] ❌ NFT approval check failed:`, approvalErr.message);
          throw approvalErr;
        }
      }
    }
    console.log('✅ All precondition validations passed');

    // ✅ CRITICAL FIX: Fetch gas prices from Pimlico's API
    // Pimlico enforces minimum gas prices that may be higher than the chain's current price
    const { maxFeePerGas, maxPriorityFeePerGas } = await getPimlicoGasPrices();

    console.log('🚀 Submitting UserOperation with Pimlico gas prices...');
    console.log('   Max fee per gas:', maxFeePerGas.toString(), 'wei');
    console.log('   Max priority fee:', maxPriorityFeePerGas.toString(), 'wei');

    // Skip individual call simulation for batched transactions
    // Batched calls (like approve + swap) must execute together, simulating them individually fails
    // The precondition validation above already checks balances and basic requirements
    if (calls.length > 1) {
      console.log('✅ Batch transaction detected - skipping individual call simulation');
      console.log('   Batched calls will be validated as a whole during execution');
    } else {
      // For single calls, we can still do a quick simulation
      console.log('🔍 Simulating single call to catch errors early...');
      const call = calls[0];
      const functionSelector = call.data.slice(0, 10);

      console.log(`   Simulating: ${call.to} (selector: ${functionSelector})`);

      try {
        await publicClient.call({
          account: SAFE_ACCOUNT,
          to: call.to,
          data: call.data,
          value: call.value,
        });

        console.log(`   ✅ Simulation passed`);
      } catch (simErr: any) {
        console.error(`   ❌ Simulation failed:`, {
          message: simErr.message,
          shortMessage: simErr.shortMessage,
          details: simErr.details,
        });

        // Extract parameters to provide better error context for stakeWithDeposit
        if (functionSelector === '0xb438aa31') {
          // stakeWithDeposit
          try {
            const nftAddress = ('0x' + call.data.slice(34, 74)) as Address;
            const nftTokenId = BigInt('0x' + call.data.slice(74, 138));
            const toursAmount = BigInt('0x' + call.data.slice(138, 202));
            const beneficiary = ('0x' + call.data.slice(226, 266)) as Address;

            console.error(`   Call details:`, {
              target: call.to,
              nftAddress,
              nftTokenId: nftTokenId.toString(),
              toursAmount: (Number(toursAmount) / 1e18).toFixed(2) + ' TOURS',
              beneficiary,
            });

            // Provide specific guidance based on error
            const errMsg = simErr.shortMessage || simErr.message || '';

            // Check for known specific errors
            if (errMsg.includes('Invalid NFT address') || errMsg.includes('acceptedNFTs')) {
              throw new Error(
                `NFT at ${nftAddress} is not whitelisted in YieldStrategy (${call.to}).\n` +
                `Please verify you're using the correct YieldStrategy contract address.\n` +
                `Current target: ${call.to}`
              );
            } else if (errMsg.includes('Beneficiary must own NFT') || errMsg.includes('ownerOf')) {
              throw new Error(
                `Beneficiary ${beneficiary} does not own NFT #${nftTokenId} from ${nftAddress}.\n` +
                `Verify the correct NFT token ID is being used.`
              );
            } else if (errMsg.includes('NFT already used') || errMsg.includes('collateral')) {
              throw new Error(
                `NFT #${nftTokenId} is already being used as collateral in another staking position.\n` +
                `Each NFT can only be used once. Please unstake the existing position first.`
              );
            } else if (errMsg.includes('not approved') || errMsg.includes('ERC721: transfer caller is not owner nor approved') || errMsg.includes('approve')) {
              throw new Error(
                `NFT #${nftTokenId} is not approved for YieldStrategy to manage.\n` +
                `The beneficiary (${beneficiary}) must first approve the YieldStrategy contract.\n` +
                `Please execute: NFT.approve(${call.to}, ${nftTokenId}) from the beneficiary's wallet.\n` +
                `Or use: NFT.setApprovalForAll(${call.to}, true) to approve all NFTs at once.`
              );
            }
          } catch (extractErr) {
            // If we can't extract params, fall through to generic error
          }
        }

        // Generic error - throw with the original message
        throw new Error(
          `Simulation failed for call to ${call.to}:\n` +
          `${simErr.shortMessage || simErr.message}\n\n` +
          `This indicates a real configuration issue. Common causes:\n` +
          `1. Wrong contract address configured\n` +
          `2. NFT not whitelisted in the target contract\n` +
          `3. Beneficiary doesn't own the NFT\n` +
          `4. NFT already used as collateral`
        );
      }
    }

  // ✅ CRITICAL: Detect approve + spend patterns
    // The bundler's gas estimation CANNOT handle this pattern because:
    // - approve() in simulation doesn't actually set allowance
    // - subsequent spend call fails in simulation
    // - but the actual execution works fine!
    let hasApproveSpendPattern = false;
    for (let i = 0; i < calls.length - 1; i++) {
      const currentSelector = calls[i].data.slice(0, 10);
      const nextSelector = calls[i + 1].data.slice(0, 10);

      if (currentSelector === '0x095ea7b3') {
        // This is an approve - check if it's followed by a spend operation
        const approveSpender = '0x' + calls[i].data.slice(34, 74);
        const nextTarget = calls[i + 1].to;

        if (approveSpender.toLowerCase() === nextTarget.toLowerCase()) {
          hasApproveSpendPattern = true;
          console.log(`⚠️  Detected approve + spend pattern (Call ${i} -> Call ${i+1})`);
          console.log('   This pattern will fail bundler gas estimation but succeed in execution');
          break;
        }
      }
    }

    // ✅ CRITICAL FIX: Provide initial gas limits for estimation
    // Without these, the bundler simulation may fail with insufficient gas
    // Increased limits significantly to handle complex multi-call operations
    const initialGasLimits = {
      callGasLimit: 2_000_000n, // Gas for the actual execution (increased from 500k)
      verificationGasLimit: 1_000_000n, // Gas for signature verification (increased from 500k)
      preVerificationGas: 200_000n, // Gas for bundler overhead (increased from 100k)
    };

    // ✅ NEW: If we have an approve + spend pattern, skip gas estimation
    // and use known-good values from previous successful transactions
    let estimatedGas;
    if (hasApproveSpendPattern) {
      console.log('🔧 Using fixed gas values for approve + spend pattern (skipping estimation)');
      console.log('   Bundler gas estimation will fail for this pattern, but execution will succeed');

      // These values are increased to handle complex operations like lottery entry
      // which requires wrap MON + approve WMON + enter lottery in one UserOp
      // Base values get 150% buffer applied later (line 714)
      estimatedGas = {
        callGasLimit: 1_500_000n,        // 1.5M base → 2.25M with buffer
        verificationGasLimit: 1_000_000n, // 1M base → 1.5M with buffer
        preVerificationGas: 1_400_000n,   // 1.4M base → 2.1M with buffer (bundler needs ~1.8M)
      };

      console.log('   Using fixed gas values:', JSON.stringify(estimatedGas, (_, v) =>
        typeof v === 'bigint' ? v.toString() : v
      ));
    } else {
      // Try to manually estimate gas first to get better error messages
      try {
        console.log('🔍 Attempting manual gas estimation with initial limits...');
        console.log('   Initial callGasLimit:', initialGasLimits.callGasLimit.toString());
        console.log('   Initial verificationGasLimit:', initialGasLimits.verificationGasLimit.toString());
        console.log('   Initial preVerificationGas:', initialGasLimits.preVerificationGas.toString());

        estimatedGas = await smartAccountClient.estimateUserOperationGas({
          account: smartAccountClient.account,
          calls,
          maxFeePerGas,
          maxPriorityFeePerGas,
          ...initialGasLimits,
        });
        console.log('✅ Gas estimation successful:', JSON.stringify(estimatedGas, (_, v) =>
          typeof v === 'bigint' ? v.toString() : v
        ));
      } catch (gasErr: any) {
      console.error('❌ Manual gas estimation failed:', {
        message: gasErr.message,
        shortMessage: gasErr.shortMessage,
        details: gasErr.details,
        cause: gasErr.cause,
      });

      // ✅ ENHANCED: Extract more details from nested errors
      if (gasErr.walk) {
        const baseError = gasErr.walk();
        console.error('   Base error:', {
          name: baseError.name,
          message: baseError.message,
          code: baseError.code,
          data: baseError.data,
        });
      }

      // ✅ ENHANCED: Try to extract revert data from the RPC error
      if (gasErr.cause?.cause?.data) {
        console.error('   Revert data from RPC:', gasErr.cause.cause.data);
      }

      // ✅ ENHANCED: Check for common error patterns and provide better messages
      const errorMsg = gasErr.shortMessage || gasErr.message || '';
      if (errorMsg.includes('reverted during simulation with reason: 0x') || errorMsg.includes('reason: 0x')) {
        console.error('   ⚠️ EMPTY REVERT DETECTED: The UserOperation simulation failed with no revert reason.');
        console.error('   This usually indicates one of the following:');
        console.error('   1. The Safe account validation logic is rejecting the operation');
        console.error('   2. One of the calls in the batch is reverting without a message');
        console.error('   3. The EntryPoint detected an invalid operation state');
        console.error('   4. Insufficient gas for the operation (try with higher limits)');
        console.error('\n   Individual call simulations passed, so the issue is likely with:');
        console.error('   - UserOperation validation in the Safe account');
        console.error('   - EntryPoint-specific validation');
        console.error('   - Gas estimation parameters');
      }

      // ✅ ENHANCED: Try with even higher gas limits as a fallback
      console.warn('⚠️ Retrying gas estimation with maximum gas limits...');
      const maxGasLimits = {
        callGasLimit: 5_000_000n, // Maximum gas for complex operations
        verificationGasLimit: 2_000_000n, // Maximum verification gas
        preVerificationGas: 500_000n, // Maximum pre-verification gas
      };

      try {
        console.log('🔍 Retry with maxGasLimits:', JSON.stringify(maxGasLimits, (_, v) =>
          typeof v === 'bigint' ? v.toString() : v
        ));

        estimatedGas = await smartAccountClient.estimateUserOperationGas({
          account: smartAccountClient.account,
          calls,
          maxFeePerGas,
          maxPriorityFeePerGas,
          ...maxGasLimits,
        });

        console.log('✅ Gas estimation succeeded with higher limits:', JSON.stringify(estimatedGas, (_, v) =>
          typeof v === 'bigint' ? v.toString() : v
        ));
      } catch (retryErr: any) {
        console.error('❌ Gas estimation failed even with maximum limits:', {
          message: retryErr.message,
          shortMessage: retryErr.shortMessage,
          details: retryErr.details,
        });

        // Extract more specific error information
        let errorDetails = retryErr.shortMessage || retryErr.message;

        // Check for common error patterns
        if (errorDetails.includes('insufficient') || errorDetails.includes('balance')) {
          errorDetails = 'Insufficient token balance. Please ensure the Safe has enough tokens for this operation.';
        } else if (errorDetails.includes('not owner') || errorDetails.includes('ownership')) {
          errorDetails = 'NFT ownership verification failed. Please ensure you own the required NFT.';
        } else if (errorDetails.includes('revert') && errorDetails.includes('0x')) {
          errorDetails = 'Transaction would revert. This could be due to: 1) Insufficient token balance, 2) Missing NFT ownership, 3) Invalid contract state, or 4) Missing approvals.';
        }

        throw new Error(`Gas estimation failed: ${errorDetails}`);
      }
      }
    }

    // ✅ Use estimated gas values with buffer for safety
    // Approve + spend patterns need 50% buffer due to bundler estimation issues
    // Single operations can use 20% buffer
    const bufferPercent = hasApproveSpendPattern ? 150n : 120n;
    const bufferLabel = hasApproveSpendPattern ? '50%' : '20%';

    const gasWithBuffer = {
      callGasLimit: (estimatedGas.callGasLimit * bufferPercent) / 100n,
      verificationGasLimit: (estimatedGas.verificationGasLimit * bufferPercent) / 100n,
      preVerificationGas: (estimatedGas.preVerificationGas * bufferPercent) / 100n,
    };

    console.log(`🚀 Using gas estimates with ${bufferLabel} buffer:${hasApproveSpendPattern ? ' (approve+spend pattern detected)' : ''}`);
    console.log('   callGasLimit:', gasWithBuffer.callGasLimit.toString());
    console.log('   verificationGasLimit:', gasWithBuffer.verificationGasLimit.toString());
    console.log('   preVerificationGas:', gasWithBuffer.preVerificationGas.toString());

    // sendUserOperation with explicit gas values
    const userOpHash = await smartAccountClient.sendUserOperation({
      account: smartAccountClient.account,
      calls,
      maxFeePerGas,
      maxPriorityFeePerGas,
      ...gasWithBuffer,
    });

    console.log('✅ UserOperation hash:', userOpHash);
    console.log('   Track your UserOperation: https://monadscan.com/op/' + userOpHash);

    // Wait for the UserOperation to be included in a transaction
    console.log('⏳ Waiting for UserOperation to be mined (timeout: 5 minutes)...');
    console.log('   Polling every 2 seconds...');

    try {
      const receipt = await smartAccountClient.waitForUserOperationReceipt({
        hash: userOpHash,
        timeout: 300_000, // 5 minutes
      });

      const txHash = receipt.receipt.transactionHash;
      console.log('✅ Transaction mined:', txHash);
      console.log('   Gas used:', receipt.receipt.gasUsed.toString());
      console.log('   Block:', receipt.receipt.blockNumber.toString());

      // ✅ CRITICAL: Check if UserOperation actually succeeded (ERC-4337 silent failure detection)
      // The transaction can have status = 1 (success) but the UserOperation's internal calls can fail
      // We must check the 'success' field in the UserOperationEvent emitted by the EntryPoint
      console.log('🔍 Validating UserOperation success...');

      // UserOperationEvent signature: UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)
      const userOpEventTopic = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f'; // keccak256("UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)")

      const userOpEvent = receipt.receipt.logs.find(
        (log: any) => log.topics[0]?.toLowerCase() === userOpEventTopic.toLowerCase()
      );

      if (!userOpEvent) {
        console.warn('⚠️  Could not find UserOperationEvent in receipt logs');
        console.warn('   Proceeding with caution - unable to verify internal call success');
      } else {
        // Parse the success flag from the event data
        // Event structure: topics[0] = event signature, topics[1] = userOpHash, topics[2] = sender, topics[3] = paymaster
        // data contains: nonce, success, actualGasCost, actualGasUsed (each 32 bytes)
        const eventData = userOpEvent.data;

        // success is the second field in data (after nonce), at bytes 32-64
        const successHex = eventData.slice(66, 130); // Skip '0x' and first 32 bytes (nonce)
        const success = BigInt('0x' + successHex) === 1n;

        console.log('   UserOperation success flag:', success);
        console.log('   Success hex:', successHex);

        if (!success) {
          console.error('❌ UserOperation FAILED - ERC-4337 silent failure detected!');
          console.error('   Transaction hash:', txHash);
          console.error('   UserOp hash:', userOpHash);
          console.error('   The blockchain transaction succeeded (status=1) but the internal calls failed (success=0)');
          console.error('   This typically happens when:');
          console.error('   1. Token approvals were insufficient');
          console.error('   2. Token balances were too low for the operation');
          console.error('   3. Contract preconditions were not met');
          console.error('   4. Gas limits were too low for complex operations');

          throw new Error(
            `UserOperation failed: Internal calls did not execute successfully. ` +
            `Transaction ${txHash} succeeded on-chain but did not perform the intended action. ` +
            `This is likely due to insufficient token balance, missing approvals, or contract preconditions not being met. ` +
            `No tokens were transferred or state changes occurred.`
          );
        }

        console.log('✅ UserOperation success validated - internal calls executed successfully');
      }

      return txHash;
    } catch (timeoutErr: any) {
      // If timeout, try to manually check the receipt one more time
      console.warn('⚠️  Initial wait timed out, checking receipt manually...');

      try {
        // Manual check via Pimlico bundler
        const receiptCheck = await fetch(PIMLICO_BUNDLER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_getUserOperationReceipt',
            params: [userOpHash],
          }),
        });

        const receiptData = await receiptCheck.json();
        console.log('📥 Manual receipt check:', receiptData);

        if (receiptData.result) {
          const txHash = receiptData.result.receipt.transactionHash;
          const success = receiptData.result.success;

          console.log('✅ Transaction was actually mined:', txHash);
          console.log('   UserOperation success:', success);

          // ✅ CRITICAL: Check if UserOperation succeeded even in manual receipt check
          if (success === false) {
            console.error('❌ UserOperation FAILED (manual check) - ERC-4337 silent failure detected!');
            throw new Error(
              `UserOperation failed: Internal calls did not execute successfully. ` +
              `Transaction ${txHash} succeeded on-chain but did not perform the intended action. ` +
              `This is likely due to insufficient token balance, missing approvals, or contract preconditions not being met.`
            );
          }

          return txHash;
        }
      } catch (manualErr) {
        console.error('❌ Manual receipt check also failed:', manualErr);
      }

      // ✅ CRITICAL FIX: Include userOpHash in timeout error so users can track their transaction
      const enhancedError: any = new Error(
        `Transaction is taking longer than expected to mine. ` +
        `UserOperation was submitted successfully and is being processed by the network. ` +
        `UserOp Hash: ${userOpHash}`
      );
      enhancedError.userOpHash = userOpHash;
      enhancedError.originalError = timeoutErr;
      throw enhancedError;
    }
  } catch (error: any) {
    console.error('❌ Transaction error:', error.message);
    console.error('   Stack:', error.stack);

    // Log more details if available
    if (error.cause) {
      console.error('   Cause:', error.cause);
    }
    if (error.details) {
      console.error('   Details:', error.details);
    }
    if (error.shortMessage) {
      console.error('   Short message:', error.shortMessage);
    }

    // ✅ CRITICAL FIX: Detect Pimlico paymaster balance exhaustion and fallback to direct Safe execution
    const errorStr = `${error.message || ''} ${error.details || ''} ${error.shortMessage || ''}`;
    if (errorStr.includes('Insufficient Pimlico balance') || errorStr.includes('pm_getPaymasterData')) {
      console.warn('⚠️  Pimlico paymaster has insufficient balance. Falling back to direct Safe execution...');
      console.warn('   This bypasses ERC-4337 and executes through the Safe contract directly.');
      try {
        const directTxHash = await sendSafeTransactionDirect(calls);
        console.log('✅ Direct Safe execution succeeded:', directTxHash);
        return directTxHash;
      } catch (directErr: any) {
        console.error('❌ Direct Safe execution also failed:', directErr.message);
        throw new Error(
          `Both Pimlico AA and direct Safe execution failed.\n` +
          `Pimlico error: ${error.details || error.message}\n` +
          `Direct error: ${directErr.message}\n\n` +
          `Solutions:\n` +
          `1. Fund Pimlico account at https://dashboard.pimlico.io\n` +
          `2. Fund Safe owner EOA with MON for direct execution`
        );
      }
    }

    // ✅ Enhanced error messaging for bundler reserve balance errors
    if (error.message?.includes('reserve balance check') || error.details?.includes('reserve balance check')) {
      const currentBalance = (Number(await publicClient.getBalance({ address: SAFE_ACCOUNT })) / 1e18).toFixed(4);

      // The error "Sender failed reserve balance check of 0 MON" is confusing
      // It means the sender doesn't have enough MON after accounting for the reserve requirement
      // Pimlico typically requires 5-10 MON for reliable operations

      console.error('❌ Reserve balance check failed');
      console.error('   Current Safe balance:', currentBalance, 'MON');
      console.error('   Pimlico typically requires: 5-10 MON for operations');
      console.error('   Gas prices may increase requirements during high network activity');

      throw new Error(
        `Insufficient MON balance for Pimlico bundler operations.\n\n` +
        `Current balance: ${currentBalance} MON\n` +
        `Required: Approximately 5-10 MON (varies with gas prices)\n` +
        `Deficit: You need to add ~${Math.max(0, 5 - parseFloat(currentBalance)).toFixed(4)} MON minimum\n\n` +
        `Safe wallet address: ${SAFE_ACCOUNT}\n\n` +
        `SOLUTION:\n` +
        `1. Fund the Safe wallet with MON tokens\n` +
        `2. Send at least 5 MON to ensure reliable operation\n` +
        `3. For high-volume operations, 10+ MON is recommended\n\n` +
        `Network: Monad Mainnet\n` +
        `Please fund the Safe wallet with MON.`
      );
    }

    throw error;
  }
}

export async function getSafeBalance(): Promise<bigint> {
  try {
    const balance = await publicClient.getBalance({
      address: SAFE_ACCOUNT,
    });
    console.log('💰 Safe balance:', balance.toString());
    return balance;
  } catch (error: any) {
    console.error('❌ Error getting Safe balance:', error.message);
    return 0n;
  }
}

export async function checkSafeBalance(requiredAmount: bigint): Promise<boolean> {
  const balance = await getSafeBalance();
  const hasBalance = balance >= requiredAmount;
  console.log(`✅ Balance check: ${balance.toString()} >= ${requiredAmount.toString()} = ${hasBalance}`);
  return hasBalance;
}

// Safe v1.4.1 ABI for direct execution (bypasses ERC-4337/Pimlico)
const SAFE_EXEC_ABI = parseAbi([
  'function nonce() view returns (uint256)',
  'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)',
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)',
]);

/**
 * Direct Safe execution - bypasses ERC-4337 and Pimlico entirely.
 * Calls the Safe's execTransaction() directly using the owner's private key.
 * Gas is paid by the Safe owner's EOA or refunded by the Safe itself.
 *
 * Use this when Pimlico paymaster has insufficient balance.
 */
export async function sendSafeTransactionDirect(
  calls: Array<{ to: Address; value: bigint; data: Hex }>
): Promise<string> {
  console.log('📤 [DirectSafe] Executing transaction directly (bypassing Pimlico AA)...');
  console.log('📦 [DirectSafe] Number of calls:', calls.length);

  const SAFE_OWNER_PRIVATE_KEY = process.env.SAFE_OWNER_PRIVATE_KEY as `0x${string}`;
  if (!SAFE_OWNER_PRIVATE_KEY) {
    throw new Error('SAFE_OWNER_PRIVATE_KEY not set - cannot execute direct Safe transaction');
  }

  const safeOwner = getSafeOwnerAccount();
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

  const walletClient = createWalletClient({
    account: safeOwner,
    chain: currentChain,
    transport: http(env.MONAD_RPC),
  });

  // Check if Safe owner has enough MON for gas
  const ownerBalance = await publicClient.getBalance({ address: safeOwner.address });
  console.log('💰 [DirectSafe] Owner EOA balance:', (Number(ownerBalance) / 1e18).toFixed(4), 'MON');

  if (ownerBalance < parseEther('0.01')) {
    throw new Error(
      `Safe owner EOA (${safeOwner.address}) has insufficient MON for gas.\n` +
      `Balance: ${(Number(ownerBalance) / 1e18).toFixed(6)} MON\n` +
      `Please fund the Safe owner with at least 0.1 MON for direct execution.`
    );
  }

  // For multiple calls, encode as MultiSend delegatecall
  let execTo: Address;
  let execData: Hex;
  let execValue: bigint;
  let operation: number; // 0 = Call, 1 = DelegateCall

  if (calls.length === 1) {
    // Single call - execute directly
    execTo = calls[0].to;
    execData = calls[0].data;
    execValue = calls[0].value;
    operation = 0; // Call
  } else {
    // Multiple calls - use MultiSend
    // MultiSend address (standard deployment, same on all EVM chains)
    const MULTISEND_ADDRESS = '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526' as Address;

    // Encode MultiSend transactions
    // Format: operation (uint8) + to (address) + value (uint256) + dataLength (uint256) + data
    let multiSendData: Hex = '0x' as Hex;
    for (const call of calls) {
      const encoded = encodePacked(
        ['uint8', 'address', 'uint256', 'uint256', 'bytes'],
        [0, call.to, call.value, BigInt(call.data.length / 2 - 1), call.data]
      );
      multiSendData = `${multiSendData}${encoded.slice(2)}` as Hex;
    }

    // Wrap in multiSend(bytes) call
    const multiSendSelector = '0x8d80ff0a'; // multiSend(bytes)
    const offsetHex = '0000000000000000000000000000000000000000000000000000000000000020';
    const dataBytes = multiSendData.slice(2);
    const dataLenHex = (dataBytes.length / 2).toString(16).padStart(64, '0');
    const paddedData = dataBytes + '0'.repeat((64 - (dataBytes.length % 64)) % 64);

    execTo = MULTISEND_ADDRESS;
    execData = `${multiSendSelector}${offsetHex}${dataLenHex}${paddedData}` as Hex;
    execValue = 0n;
    operation = 1; // DelegateCall for MultiSend
  }

  // Get Safe nonce
  const nonce = await publicClient.readContract({
    address: SAFE_ACCOUNT,
    abi: SAFE_EXEC_ABI,
    functionName: 'nonce',
  });
  console.log('   [DirectSafe] Safe nonce:', nonce.toString());

  // Get the transaction hash to sign
  const safeTxHash = await publicClient.readContract({
    address: SAFE_ACCOUNT,
    abi: SAFE_EXEC_ABI,
    functionName: 'getTransactionHash',
    args: [
      execTo,        // to
      execValue,     // value
      execData,      // data
      operation,     // operation
      0n,            // safeTxGas (0 = use all available)
      0n,            // baseGas
      0n,            // gasPrice (0 = no refund, owner pays gas)
      ZERO_ADDRESS,  // gasToken
      ZERO_ADDRESS,  // refundReceiver
      nonce,         // _nonce
    ],
  });
  console.log('   [DirectSafe] Safe tx hash:', safeTxHash);

  // Sign the hash with owner's private key (raw ECDSA, no EIP-191 prefix)
  const sig = await sign({ hash: safeTxHash, privateKey: SAFE_OWNER_PRIVATE_KEY });

  // Pack signature as r (32 bytes) + s (32 bytes) + v (1 byte)
  // Safe expects v as 27 or 28
  const rawV = sig.v ?? (sig.yParity === 0 ? 27n : 28n);
  const v = rawV < 27n ? rawV + 27n : rawV;
  const packedSignature = `${sig.r}${sig.s.slice(2)}${Number(v).toString(16).padStart(2, '0')}` as Hex;
  console.log('   [DirectSafe] Signature generated (v=%d)', Number(v));

  // Execute the transaction
  const txHash = await walletClient.writeContract({
    address: SAFE_ACCOUNT,
    abi: SAFE_EXEC_ABI,
    functionName: 'execTransaction',
    args: [
      execTo,
      execValue,
      execData,
      operation,
      0n,              // safeTxGas
      0n,              // baseGas
      0n,              // gasPrice
      ZERO_ADDRESS,    // gasToken
      ZERO_ADDRESS,    // refundReceiver
      packedSignature, // signatures
    ],
    gas: 500_000n,
  });
  console.log('✅ [DirectSafe] Transaction submitted:', txHash);

  // Wait for receipt
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 60_000,
  });

  if (receipt.status === 'reverted') {
    throw new Error(`[DirectSafe] execTransaction reverted (tx: ${txHash}). Check Safe owner signature and call data.`);
  }

  console.log('✅ [DirectSafe] Transaction confirmed in block:', receipt.blockNumber.toString());
  console.log('   Gas used:', receipt.gasUsed.toString());
  return txHash;
}
