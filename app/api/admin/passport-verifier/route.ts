import { NextResponse } from 'next/server'
import { createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { monadTestnet } from '@/lib/chains'

const PASSPORT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT_ADDRESS as `0x${string}`
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY as `0x${string}` // Owner's private key

const PASSPORT_ABI = parseAbi([
  'function addVerifier(address verifier) external',
  'function removeVerifier(address verifier) external',
  'function trustedVerifiers(address) external view returns (bool)',
])

// POST /api/admin/passport-verifier - Add or remove verifier
export async function POST(request: Request) {
  try {
    const { action, verifierAddress } = await request.json()

    if (!verifierAddress || !action) {
      return NextResponse.json(
        { error: 'Missing verifierAddress or action' },
        { status: 400 }
      )
    }

    if (!ADMIN_PRIVATE_KEY) {
      return NextResponse.json(
        { error: 'Admin private key not configured' },
        { status: 500 }
      )
    }

    // Create wallet client
    const account = privateKeyToAccount(ADMIN_PRIVATE_KEY)
    const walletClient = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(),
    })

    let txHash: `0x${string}`

    if (action === 'add') {
      // Add verifier
      txHash = await walletClient.writeContract({
        address: PASSPORT_ADDRESS,
        abi: PASSPORT_ABI,
        functionName: 'addVerifier',
        args: [verifierAddress as `0x${string}`],
      })

      return NextResponse.json({
        success: true,
        message: `Verifier ${verifierAddress} added`,
        txHash,
      })
    } else if (action === 'remove') {
      // Remove verifier
      txHash = await walletClient.writeContract({
        address: PASSPORT_ADDRESS,
        abi: PASSPORT_ABI,
        functionName: 'removeVerifier',
        args: [verifierAddress as `0x${string}`],
      })

      return NextResponse.json({
        success: true,
        message: `Verifier ${verifierAddress} removed`,
        txHash,
      })
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "add" or "remove"' },
        { status: 400 }
      )
    }
  } catch (error: any) {
    console.error('Error managing verifier:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to manage verifier' },
      { status: 500 }
    )
  }
}

// GET /api/admin/passport-verifier?address=0x... - Check if address is verifier
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')

    if (!address) {
      return NextResponse.json(
        { error: 'Missing address parameter' },
        { status: 400 }
      )
    }

    // Check verifier status (read-only, no private key needed)
    const publicClient = createWalletClient({
      chain: monadTestnet,
      transport: http(),
    })

    const isVerifier = await publicClient.readContract({
      address: PASSPORT_ADDRESS,
      abi: PASSPORT_ABI,
      functionName: 'trustedVerifiers',
      args: [address as `0x${string}`],
    })

    return NextResponse.json({
      address,
      isVerifier,
    })
  } catch (error: any) {
    console.error('Error checking verifier:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check verifier status' },
      { status: 500 }
    )
  }
}
