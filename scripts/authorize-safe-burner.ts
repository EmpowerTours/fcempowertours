import { createPublicClient, createWalletClient, http, parseAbi, Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '../app/chains';

const NFT_ADDRESS = (process.env.NEXT_PUBLIC_NFT_ADDRESS || '0xAD403897CD7d465445aF0BD4fe40f18698655D4e') as Address;
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const BOT_SIGNER_ADDRESS = (process.env.NEXT_PUBLIC_BOT_SIGNER_ADDRESS || '0x37302543aeF0b06202adcb06Db36daB05F8237E9') as Address;

if (!DEPLOYER_KEY) {
  console.error('❌ DEPLOYER_PRIVATE_KEY not set');
  process.exit(1);
}

const account = privateKeyToAccount(`0x${DEPLOYER_KEY.replace(/^0x/, '')}`);

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http(),
});

async function authorizeBurner(burnerAddress: Address) {
  console.log(`🔐 Authorizing burner: ${burnerAddress}`);

  // Check if already authorized
  const isAuthorized = await publicClient.readContract({
    address: NFT_ADDRESS,
    abi: parseAbi(['function authorizedBurners(address) external view returns (bool)']),
    functionName: 'authorizedBurners',
    args: [burnerAddress],
  });

  if (isAuthorized) {
    console.log(`✅ ${burnerAddress} is already authorized`);
    return;
  }

  console.log(`📝 Calling setAuthorizedBurner...`);

  const hash = await walletClient.writeContract({
    address: NFT_ADDRESS,
    abi: parseAbi(['function setAuthorizedBurner(address burner, bool authorized) external']),
    functionName: 'setAuthorizedBurner',
    args: [burnerAddress, true],
  });

  console.log(`⏳ Transaction sent: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
  console.log(`✅ ${burnerAddress} is now authorized to burn NFTs!`);
}

async function main() {
  console.log('🔥 Authorizing Bot Signer as NFT Burner');
  console.log(`NFT Contract: ${NFT_ADDRESS}`);
  console.log(`Deployer: ${account.address}`);
  console.log(`Bot Signer: ${BOT_SIGNER_ADDRESS}`);

  await authorizeBurner(BOT_SIGNER_ADDRESS);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
