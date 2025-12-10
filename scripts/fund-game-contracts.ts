import { createWalletClient, http, createPublicClient, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '@/app/chains';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
  }
});

const MUSIC_BEAT_MATCH_V2 = '0x913E65B7742Da72972fB821468215E89F085F178';
const COUNTRY_COLLECTOR_V2 = '0xC7FfA579f66f6A3142b3e27427b04124F4b3cd61';
const TOURS_TOKEN = '0xa123600c82E69cB311B0e068B06Bfa9F787699B7';
const DEPLOYER_KEY = envVars.DEPLOYER_PRIVATE_KEY;

async function main() {
  const account = privateKeyToAccount(
    DEPLOYER_KEY.startsWith('0x') ? DEPLOYER_KEY as `0x${string}` : `0x${DEPLOYER_KEY}` as `0x${string}`
  );

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
  });

  console.log('=== Funding Game Contracts with TOURS ===\n');
  console.log('Deployer:', account.address);

  // Check deployer balance
  const balance = await publicClient.readContract({
    address: TOURS_TOKEN as `0x${string}`,
    abi: [{
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ type: 'address' }],
      outputs: [{ type: 'uint256' }]
    }],
    functionName: 'balanceOf',
    args: [account.address],
  });

  console.log(`Deployer TOURS balance: ${Number(balance) / 1e18} TOURS\n`);

  if (Number(balance) < parseEther('100000')) {
    console.log('⚠️  WARNING: Deployer has less than 100,000 TOURS. May not have enough to fund both contracts.');
  }

  // Fund MusicBeatMatchV2 with 50,000 TOURS
  console.log('Funding MusicBeatMatchV2 with 50,000 TOURS...');
  const beatMatchTx = await walletClient.writeContract({
    address: TOURS_TOKEN as `0x${string}`,
    abi: [{
      name: 'transfer',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { type: 'address', name: 'to' },
        { type: 'uint256', name: 'amount' }
      ],
      outputs: [{ type: 'bool' }]
    }],
    functionName: 'transfer',
    args: [MUSIC_BEAT_MATCH_V2 as `0x${string}`, parseEther('50000')],
  });

  await publicClient.waitForTransactionReceipt({ hash: beatMatchTx });
  console.log(`✅ MusicBeatMatchV2 funded: ${beatMatchTx}`);

  // Check remaining balance after first transfer
  const remainingBalance = await publicClient.readContract({
    address: TOURS_TOKEN as `0x${string}`,
    abi: [{
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ type: 'address' }],
      outputs: [{ type: 'uint256' }]
    }],
    functionName: 'balanceOf',
    args: [account.address],
  });

  const remainingTours = Number(remainingBalance) / 1e18;
  console.log(`\nRemaining deployer balance: ${remainingTours} TOURS`);

  // Fund CountryCollectorV2 with remaining balance (minus 100 for gas buffer)
  const amountToSend = remainingTours > 100 ? remainingTours - 100 : remainingTours;
  console.log(`Funding CountryCollectorV2 with ${amountToSend.toFixed(2)} TOURS...`);

  const collectorTx = await walletClient.writeContract({
    address: TOURS_TOKEN as `0x${string}`,
    abi: [{
      name: 'transfer',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { type: 'address', name: 'to' },
        { type: 'uint256', name: 'amount' }
      ],
      outputs: [{ type: 'bool' }]
    }],
    functionName: 'transfer',
    args: [COUNTRY_COLLECTOR_V2 as `0x${string}`, parseEther(amountToSend.toString())],
  });

  await publicClient.waitForTransactionReceipt({ hash: collectorTx });
  console.log(`✅ CountryCollectorV2 funded: ${collectorTx}`);

  console.log('\n=== Funding Complete ===');
  console.log('Both game contracts now have 50,000 TOURS each for rewards!');
}

main().catch(console.error);
