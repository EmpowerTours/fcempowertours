import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  Address,
  PublicClient,
  WalletClient,
  parseAbi,
  Hash,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import config, { monadTestnet, monadMainnet } from '../config';

// ERC20 ABI for token interactions
const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

// Claim contract ABI (simplified)
const CLAIM_ABI = parseAbi([
  'function claim() external',
  'function claimable(address user) view returns (uint256)',
  'function hasClaimed(address user) view returns (bool)',
]);

class BlockchainService {
  private publicClient: PublicClient;
  private walletClient: WalletClient | null = null;
  private tokenDecimals: number = 18;
  private initialized: boolean = false;

  constructor() {
    const chain = config.blockchain.network === 'mainnet' ? monadMainnet : monadTestnet;

    this.publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    // Initialize wallet client if private key is provided
    if (config.blockchain.tipPoolPrivateKey && config.blockchain.tipPoolPrivateKey !== '0x') {
      const account = privateKeyToAccount(config.blockchain.tipPoolPrivateKey);
      this.walletClient = createWalletClient({
        account,
        chain,
        transport: http(),
      });
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Get token decimals
      if (config.blockchain.toursTokenAddress !== '0x0000000000000000000000000000000000000000') {
        this.tokenDecimals = await this.publicClient.readContract({
          address: config.blockchain.toursTokenAddress,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }) as number;
      }
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize blockchain service:', error);
      // Use default decimals
      this.tokenDecimals = 18;
      this.initialized = true;
    }
  }

  // Get TOURS token balance for an address
  async getBalance(address: Address): Promise<bigint> {
    await this.initialize();

    try {
      const balance = await this.publicClient.readContract({
        address: config.blockchain.toursTokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });

      return balance as bigint;
    } catch (error) {
      console.error('Error getting balance:', error);
      throw new Error('Failed to get token balance');
    }
  }

  // Format balance with proper decimals
  formatBalance(balance: bigint): string {
    return formatUnits(balance, this.tokenDecimals);
  }

  // Parse amount to token units
  parseAmount(amount: string): bigint {
    return parseUnits(amount, this.tokenDecimals);
  }

  // Get token decimals
  getDecimals(): number {
    return this.tokenDecimals;
  }

  // Transfer tokens from tip pool to recipient
  async transferFromPool(to: Address, amount: bigint): Promise<Hash> {
    if (!this.walletClient) {
      throw new Error('Wallet client not initialized. TIP_POOL_PRIVATE_KEY not configured.');
    }

    await this.initialize();

    try {
      const hash = await this.walletClient.writeContract({
        address: config.blockchain.toursTokenAddress,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [to, amount],
      });

      return hash;
    } catch (error) {
      console.error('Error transferring tokens:', error);
      throw new Error('Failed to transfer tokens');
    }
  }

  // Get tip pool balance
  async getTipPoolBalance(): Promise<bigint> {
    if (!this.walletClient?.account) {
      return 0n;
    }

    return this.getBalance(this.walletClient.account.address);
  }

  // Get tip pool address
  getTipPoolAddress(): Address | null {
    return this.walletClient?.account?.address || null;
  }

  // Check claimable amount from claim contract
  async getClaimableAmount(address: Address): Promise<bigint> {
    if (config.blockchain.claimContractAddress === '0x0000000000000000000000000000000000000000') {
      return 0n;
    }

    await this.initialize();

    try {
      const claimable = await this.publicClient.readContract({
        address: config.blockchain.claimContractAddress,
        abi: CLAIM_ABI,
        functionName: 'claimable',
        args: [address],
      });

      return claimable as bigint;
    } catch (error) {
      console.error('Error checking claimable amount:', error);
      return 0n;
    }
  }

  // Check if user has already claimed
  async hasClaimed(address: Address): Promise<boolean> {
    if (config.blockchain.claimContractAddress === '0x0000000000000000000000000000000000000000') {
      return false;
    }

    await this.initialize();

    try {
      const claimed = await this.publicClient.readContract({
        address: config.blockchain.claimContractAddress,
        abi: CLAIM_ABI,
        functionName: 'hasClaimed',
        args: [address],
      });

      return claimed as boolean;
    } catch (error) {
      console.error('Error checking claim status:', error);
      return false;
    }
  }

  // Wait for transaction confirmation
  async waitForTransaction(hash: Hash): Promise<boolean> {
    try {
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });

      return receipt.status === 'success';
    } catch (error) {
      console.error('Error waiting for transaction:', error);
      return false;
    }
  }

  // Validate address format
  isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  // Get native token (MON) balance
  async getNativeBalance(address: Address): Promise<bigint> {
    try {
      return await this.publicClient.getBalance({ address });
    } catch (error) {
      console.error('Error getting native balance:', error);
      throw new Error('Failed to get native balance');
    }
  }

  // Get token info
  async getTokenInfo(): Promise<{ name: string; symbol: string; decimals: number; totalSupply: bigint }> {
    await this.initialize();

    try {
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        this.publicClient.readContract({
          address: config.blockchain.toursTokenAddress,
          abi: ERC20_ABI,
          functionName: 'name',
        }),
        this.publicClient.readContract({
          address: config.blockchain.toursTokenAddress,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }),
        this.publicClient.readContract({
          address: config.blockchain.toursTokenAddress,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }),
        this.publicClient.readContract({
          address: config.blockchain.toursTokenAddress,
          abi: ERC20_ABI,
          functionName: 'totalSupply',
        }),
      ]);

      return {
        name: name as string,
        symbol: symbol as string,
        decimals: decimals as number,
        totalSupply: totalSupply as bigint,
      };
    } catch (error) {
      console.error('Error getting token info:', error);
      throw new Error('Failed to get token info');
    }
  }

  // Get current network info
  getNetworkInfo(): { name: string; chainId: number; isTestnet: boolean } {
    const chain = config.getChain();
    return {
      name: chain.name,
      chainId: chain.id,
      isTestnet: chain.testnet || false,
    };
  }
}

// Singleton instance
export const blockchain = new BlockchainService();
export default blockchain;
