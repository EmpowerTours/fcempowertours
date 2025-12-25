import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, Wallet, Contract, parseEther } from 'ethers';

const TOURS_ADDRESS = process.env.NEXT_PUBLIC_TOURS_TOKEN || '0x46d048EB424b0A95d5185f39C760c5FA754491d0';
const PASSPORT_NFT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT_NFT || process.env.NEXT_PUBLIC_PASSPORT || '0xCDdE80E0cf16b31e7Ad7D83dD012d33b328f9E4f';
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc-testnet.monadinfra.com';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

export async function POST(req: NextRequest) {
  try {
    const { amount = '100' } = await req.json();

    if (!DEPLOYER_PRIVATE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Server not configured' },
        { status: 500 }
      );
    }

    console.log(`✅ Approving ${amount} TOURS for passport contract`);

    const provider = new JsonRpcProvider(MONAD_RPC);
    const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const contract = new Contract(TOURS_ADDRESS, ERC20_ABI, deployer);

    const approveAmount = parseEther(amount.toString());
    const tx = await contract.approve(PASSPORT_NFT_ADDRESS, approveAmount);

    console.log('📤 Approval tx:', tx.hash);
    const receipt = await tx.wait();

    if (receipt?.status !== 1) {
      throw new Error('Approval failed on chain');
    }

    console.log('✅ TOURS approved!');

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      amount,
    });

  } catch (error: any) {
    console.error('❌ Approval error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Approval failed' },
      { status: 500 }
    );
  }
}
