import { usePrivy, useWallets } from '@privy-io/react-auth';
import { type Hex } from 'viem';

export function usePrivyPrivateKey() {
  const { user } = usePrivy();
  const { wallets } = useWallets();

  const getPrivateKey = async (): Promise<Hex> => {
    const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
    
    if (!embeddedWallet) {
      throw new Error('No embedded wallet found');
    }

    // Get provider
    const provider = await embeddedWallet.getEthereumProvider();
    
    // Request private key export (this is safe with Privy's embedded wallet)
    try {
      const privateKey = await provider.request({
        method: 'eth_private_key', // Privy-specific method
      }) as string;

      return privateKey as Hex;
    } catch (error) {
      console.error('Could not export private key:', error);
      throw new Error('Private key export failed. Use wallet address directly.');
    }
  };

  const getWalletAddress = (): string | undefined => {
    const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
    return embeddedWallet?.address;
  };

  return { getPrivateKey, getWalletAddress };
}
