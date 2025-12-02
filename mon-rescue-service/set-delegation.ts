import { createWalletClient, http, parseEther, encodeFunctionData, keccak256, encodeAbiParameters, toHex, concat, numberToHex } from 'viem';
import { privateKeyToAccount, signAuthorization } from 'viem/accounts';

// Configuration
const COMPROMISED_PRIVATE_KEY = '0x054c4eb995fd41652d23d042cc3b0e7143a67c8b7f4804b09df450ca863f44d6' as `0x${string}`;
const SAFE_DESTINATION_ADDRESS = '0x42592CB1a8D5F40099A36420b73f9971Bc95bAE7' as `0x${string}`;

// If you have a DIFFERENT funded wallet to pay for gas, put its private key here
// Otherwise, we'll try to use the compromised wallet (needs MON for gas)
const GAS_PAYER_PRIVATE_KEY = process.env.GAS_PAYER_KEY as `0x${string}` || COMPROMISED_PRIVATE_KEY;

const MONAD_RPC = 'https://rpc.monad.xyz';

const monad = {
  id: 10143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: [MONAD_RPC] },
  },
} as const;

const compromisedAccount = privateKeyToAccount(COMPROMISED_PRIVATE_KEY);
const gasPayerAccount = privateKeyToAccount(GAS_PAYER_PRIVATE_KEY);

console.log('🛡️ EIP-7702 DEFENSIVE DELEGATION SCRIPT');
console.log('========================================');
console.log(`Compromised address: ${compromisedAccount.address}`);
console.log(`Gas payer address: ${gasPayerAccount.address}`);
console.log(`Safe destination: ${SAFE_DESTINATION_ADDRESS}`);
console.log('');

async function setNullDelegation() {
  const client = createWalletClient({
    account: gasPayerAccount,
    chain: monad,
    transport: http(MONAD_RPC),
  });

  console.log('📝 Step 1: Signing EIP-7702 authorization to clear delegation...');

  try {
    // Sign an authorization to set delegation to address(0) - effectively clearing it
    // This makes the account behave as a regular EOA
    const authorization = await signAuthorization(client, {
      account: compromisedAccount,
      contractAddress: '0x0000000000000000000000000000000000000000', // Null delegation
      delegate: true,
    });

    console.log('✅ Authorization signed!');
    console.log(`   Chain ID: ${authorization.chainId}`);
    console.log(`   Nonce: ${authorization.nonce}`);
    console.log('');

    console.log('📤 Step 2: Submitting transaction to set null delegation...');

    // Submit the authorization in a transaction
    // This requires the gas payer to have MON
    const hash = await client.sendTransaction({
      authorizationList: [authorization],
      to: compromisedAccount.address, // Send to self
      value: 0n,
    });

    console.log(`✅ Transaction sent: ${hash}`);
    console.log(`🔍 Check: https://explorer.monad.xyz/tx/${hash}`);
    console.log('');
    console.log('🎉 Null delegation set! The compromised account is now a regular EOA.');
    console.log('   The attacker cannot set up a sweeper delegation without you racing them.');

  } catch (error: any) {
    if (error.message?.includes('insufficient funds')) {
      console.log('❌ ERROR: No gas to submit transaction!');
      console.log('');
      console.log('OPTIONS:');
      console.log('1. Fund the gas payer address with MON');
      console.log('2. Set GAS_PAYER_KEY env var to a funded wallet private key');
      console.log('3. Wait for MON allocation and hope rescue script is faster');
    } else {
      console.log('❌ Error:', error.message);
    }
  }
}

// Alternative: Set delegation to a "guardian" contract that only allows transfers to safe address
async function deployGuardianAndSetDelegation() {
  console.log('🏗️ This would deploy a guardian contract and set delegation to it.');
  console.log('   Requires more gas than null delegation.');
  console.log('   Not implemented yet - use null delegation for simplicity.');
}

// Run
setNullDelegation();
