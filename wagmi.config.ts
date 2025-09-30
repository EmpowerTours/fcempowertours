import { defineConfig } from '@wagmi/cli';
import { react } from '@wagmi/cli/plugins';
import { monadTestnet } from './app/chains';

export default defineConfig({
  out: 'app/generated.ts',
  contracts: [
    {
      name: 'MusicNFT',
      abi: require('./lib/abis/MusicNFT.json'),
      address: {
        [monadTestnet.id]: '0x41eA7CfDcD27639Ab15D0F24ca1ef12aD2Ffe9d2',
      },
    },
    {
      name: 'TOURS',
      abi: require('./lib/abis/TOURS.json'),
      address: {
        [monadTestnet.id]: '0xa123600c82E69cB311B0e068B06Bfa9F787699B7',
      },
    },
  ],
  plugins: [react()],
});
