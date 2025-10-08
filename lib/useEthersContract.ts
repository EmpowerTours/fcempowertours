import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { useAccount } from 'wagmi';

export function useEthersContract(address: string, abi: any) {
  const { address: userAddress } = useAccount();
  const [contract, setContract] = useState<ethers.Contract | null>(null);

  useEffect(() => {
    const initContract = async () => {
      if (!window.ethereum) return;
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contractInstance = new ethers.Contract(address, abi, signer);
      setContract(contractInstance);
    };
    initContract();
  }, [address, abi]);

  return { contract, userAddress };
}
