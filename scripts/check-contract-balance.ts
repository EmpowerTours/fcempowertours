import { createPublicClient, http } from 'viem';
import { monadTestnet } from '@/app/chains';

const client = createPublicClient({ chain: monadTestnet, transport: http() });

const contracts = [
  { name: 'MusicBeatMatchV2', address: '0x913E65B7742Da72972fB821468215E89F085F178' },
  { name: 'CountryCollectorV2', address: '0xC7FfA579f66f6A3142b3e27427b04124F4b3cd61' }
];

const TOURS_TOKEN = '0xa123600c82E69cB311B0e068B06Bfa9F787699B7';

async function main() {
  console.log('=== Checking TOURS Token Balances ===\n');

  for (const contract of contracts) {
    const balance = await client.readContract({
      address: TOURS_TOKEN as `0x${string}`,
      abi: [{
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ type: 'address', name: 'account' }],
        outputs: [{ type: 'uint256' }]
      }],
      functionName: 'balanceOf',
      args: [contract.address as `0x${string}`],
    });
    console.log(`${contract.name}: ${Number(balance) / 1e18} TOURS`);
  }
}

main().catch(console.error);
