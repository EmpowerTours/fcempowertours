import { defineConfig } from '@wagmi/cli';
import { react } from '@wagmi/cli/plugins';
import { monadTestnet } from './app/chains';
import type { Abi } from 'viem';

export default defineConfig({
  out: 'app/generated.ts',
  contracts: [
    {
      name: 'MusicNFT',
      abi: require('./lib/abis/MusicNFT.json') as Abi,
      address: {
        [monadTestnet.id]: '0x41eA7CfDcD27639Ab15D0F24ca1ef12aD2Ffe9d2',
      },
    },
    {
      name: 'TOURS',
      abi: require('./lib/abis/TOURS.json') as Abi,
      address: {
        [monadTestnet.id]: '0xa123600c82E69cB311B0e068B06Bfa9F787699B7',
      },
    },
    {
      name: 'Vault',
      abi: require('./lib/abis/Vault.json') as Abi,
      address: {
        [monadTestnet.id]: '0xDd57B4eae4f7285DB943edCe8777f082b2f02f79',
      },
    },
    {
      name: 'Passport',
      abi: require('./lib/abis/Passport.json') as Abi,
      address: {
        [monadTestnet.id]: '0x92D5a2b741b411988468549a5f117174A1aC8D7b',
      },
    },
    {
      name: 'Market',
      abi: require('./lib/abis/Market.json') as Abi,
      address: {
        [monadTestnet.id]: '0x48a4B5b9F97682a4723eBFd0086C47C70B96478C',
      },
    },
    {
      name: 'Itinerary',
      abi: require('./lib/abis/Itinerary.json') as Abi,
      address: {
        [monadTestnet.id]: '0x382072Abe7Eb9f72c08b1BDB252FE320F0d00934',
      },
    },
  ],
  plugins: [react()],
});
