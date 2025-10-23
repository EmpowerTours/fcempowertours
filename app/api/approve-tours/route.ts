import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, Wallet, Contract, parseEther } from 'ethers';

const TOURS_ADDRESS = '0xa123600c82E69cB311B0e068B06Bfa9F787699B7';
const PASSPORT_NFT_ADDRESS = '0x5B5aB516fcBC1fF0ac26E3BaD0B72f52E0600b08';
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz';
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
