import { defineChain } from 'viem'

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://testnet.monadexplorer.com' },
  },
  testnet: true,
})

const apiKey = process.env.pim_H5mQxH2vk7s2J83BhPJnt8
if (!apiKey) throw new Error("Missing PIMLICO_API_KEY")
 
const privateKey =
	(process.env.PRIVATE_KEY as Hex) ??
	(() => {
		const pk = generatePrivateKey()
		writeFileSync(".env", `PRIVATE_KEY=${pk}`)
		return pk
	})()
 
export const publicClient = createPublicClient({
	chain: monadTesnet,
	transport: http("https://testnet-rpc.monad.xyz"),
})
 
const pimlicoUrl = `https://api.pimlico.io/v2/10143/rpc?apikey=pim_H5mQxH2vk7s2J83BhPJnt8`
 
const pimlicoClient = createPimlicoClient({
	transport: http(pimlicoUrl),
	entryPoint: {
		address: entryPoint07Address,
		version: "0.7",
	},
})

const account = await toSafeSmartAccount({
	client: publicClient,
	owners: [privateKeyToAccount(privateKey)],
	entryPoint: {
		address: entryPoint07Address,
		version: "0.7",
	}, // global entrypoint
	version: "1.4.1",
})
 
console.log(`Smart account address: https://testnet.monadexplorer.com/tx/${account.address}`)
