'use client';
import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Abi, getContract, createPublicClient, http } from 'viem';
import { useAppKit } from '@reown/appkit/react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import * as Select from '@radix-ui/react-select';
import { PinataSDK } from 'pinata';
import { generateCountryPassportSVG } from '../../lib/gemini';
import { countryData } from '../../lib/countries';
import PassportABI from '../../lib/abis/PassportNFT.json';
import { monadTestnet } from '../chains';
import Image from 'next/image';
export const dynamic = 'force-dynamic';
const PASSPORT_NFT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT as `0x${string}`;
const client = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC!),
});
const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
});
function ConnectButton() {
  const { open } = useAppKit();
  return (
    <Button onClick={() => open({ view: 'Connect' })} className="ml-2">
      Connect
    </Button>
  );
}
export default function PassportPage() {
  const [passports, setPassports] = useState<
    { id: bigint; name: string; image: string; tokenURI: string }[]
  >([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('US');
  const [minting, setMinting] = useState(false);
  const { address, isConnected } = useAccount();
  // Fetch passports
  useEffect(() => {
    const fetchPassports = async () => {
      if (!client || !address) return;
      const passportNFT = getContract({
        address: PASSPORT_NFT_ADDRESS,
        abi: PassportABI as Abi,
        client: { public: client },
      });
      const balance = await passportNFT.read.balanceOf([address]) as bigint;
      const passportList: {
        id: bigint;
        name: string;
        image: string;
        tokenURI: string;
      }[] = [];
      for (let i = 0; i < Number(balance); i++) {
        const tokenId = await passportNFT.read.tokenOfOwnerByIndex([
          address,
          BigInt(i),
        ]) as bigint;
        // ✅ Cast tokenURI to string
        const tokenURI = (await passportNFT.read.tokenURI([tokenId])) as string;
        const metadataResponse = await fetch(
          tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/')
        );
        const metadata = await metadataResponse.json();
        passportList.push({
          id: tokenId,
          name: metadata.name || `Passport #${tokenId.toString()}`,
          image: metadata.image,
          tokenURI,
        });
      }
      setPassports(passportList);
    };
    if (isConnected && address) fetchPassports();
  }, [isConnected, address]);
  const handleMint = async () => {
    if (!isConnected || !address) return;
    setMinting(true);
    try {
      const countryInfo = countryData[selectedCountry] || countryData['US'];
      const svg = await generateCountryPassportSVG(countryInfo.name);
      const svgFile = new File([svg], `${countryInfo.name}_passport.svg`, { type: 'image/svg+xml' });
      const svgResponse = await pinata.upload.public.file(svgFile);
      const imageCid = svgResponse.cid;
      const metadata = {
        name: `EmpowerTours Passport #${passports.length + 1}`,
        description: `A digital passport for travel enthusiasts, representing ${countryInfo.name}.`,
        image: `ipfs://${imageCid}`,
        attributes: [
          { trait_type: 'Country', value: countryInfo.name },
          { trait_type: 'Symbol', value: countryInfo.symbol },
        ],
      };
      const metadataFile = new File([JSON.stringify(metadata)], `${countryInfo.name}_passport_metadata.json`, { type: 'application/json' });
      const metadataResponse = await pinata.upload.public.file(metadataFile);
      console.log('Minted metadata at:', metadataResponse.cid);
    } catch (error) {
      console.error('Minting failed:', error);
    } finally {
      setMinting(false);
    }
  };
  return (
    <div className="min-h-screen bg-background p-6">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-foreground">Your Passports</h1>
      </header>
      {!isConnected ? (
        <div className="text-center">
          <p className="text-lg text-muted-foreground mb-4">
            Connect wallet to view passports.
          </p>
          <ConnectButton />
        </div>
      ) : passports.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {passports.map((passport) => (
            <Card key={passport.id.toString()} className="shadow-md">
              <CardHeader>
                <h2 className="text-xl font-semibold">{passport.name}</h2>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  ID: {passport.id.toString()}
                </p>
                <Image
                  src={passport.image.replace(
                    'ipfs://',
                    'https://ipfs.io/ipfs/'
                  )}
                  alt={passport.name}
                  width={300}
                  height={200}
                  className="mt-2 rounded"
                />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center">
          <p className="text-lg text-muted-foreground mb-4">
            No passports found.
          </p>
          <Select.Root value={selectedCountry} onValueChange={setSelectedCountry}>
            <Select.Trigger className="w-[180px] mx-auto mb-4">
              <Select.Value placeholder="Select country" />
            </Select.Trigger>
            <Select.Content>
              {Object.keys(countryData).map((code) => (
                <Select.Item key={code} value={code}>
                  {countryData[code].name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Button onClick={handleMint} disabled={minting}>
            {minting ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
            Mint One!
          </Button>
        </div>
      )}
    </div>
  );
}
