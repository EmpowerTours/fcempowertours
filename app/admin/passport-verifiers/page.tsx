'use client'

import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, useReadContract } from 'wagmi'
import { Address, parseAbi } from 'viem'

const PASSPORT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT_ADDRESS as Address
const PASSPORT_ABI = parseAbi([
  'function addVerifier(address verifier) external',
  'function removeVerifier(address verifier) external',
  'function trustedVerifiers(address) external view returns (bool)',
  'function owner() external view returns (address)',
])

export default function PassportVerifiersAdmin() {
  const { address: userAddress } = useAccount()
  const [newVerifier, setNewVerifier] = useState('')
  const [verifierToRemove, setVerifierToRemove] = useState('')
  const [isOwner, setIsOwner] = useState(false)

  // Check if connected user is owner
  const { data: ownerAddress } = useReadContract({
    address: PASSPORT_ADDRESS,
    abi: PASSPORT_ABI,
    functionName: 'owner',
  })

  useEffect(() => {
    if (ownerAddress && userAddress) {
      setIsOwner(ownerAddress.toLowerCase() === userAddress.toLowerCase())
    }
  }, [ownerAddress, userAddress])

  // Add verifier
  const { writeContract: addVerifier, isPending: isAddingVerifier } = useWriteContract()

  const handleAddVerifier = async () => {
    if (!newVerifier) return

    try {
      addVerifier({
        address: PASSPORT_ADDRESS,
        abi: PASSPORT_ABI,
        functionName: 'addVerifier',
        args: [newVerifier as Address],
      })
      setNewVerifier('')
    } catch (error) {
      console.error('Error adding verifier:', error)
    }
  }

  // Remove verifier
  const { writeContract: removeVerifier, isPending: isRemovingVerifier } = useWriteContract()

  const handleRemoveVerifier = async () => {
    if (!verifierToRemove) return

    try {
      removeVerifier({
        address: PASSPORT_ADDRESS,
        abi: PASSPORT_ABI,
        functionName: 'removeVerifier',
        args: [verifierToRemove as Address],
      })
      setVerifierToRemove('')
    } catch (error) {
      console.error('Error removing verifier:', error)
    }
  }

  // Check if address is verifier
  const [checkAddress, setCheckAddress] = useState('')
  const { data: isVerifier, refetch: checkVerifier } = useReadContract({
    address: PASSPORT_ADDRESS,
    abi: PASSPORT_ABI,
    functionName: 'trustedVerifiers',
    args: checkAddress ? [checkAddress as Address] : undefined,
  })

  if (!userAddress) {
    return (
      <div className="container mx-auto p-8">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          Please connect your wallet to access admin functions.
        </div>
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div className="container mx-auto p-8">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong>Access Denied:</strong> You must be the contract owner to manage verifiers.
          <br />
          <small>Owner: {ownerAddress}</small>
          <br />
          <small>Your address: {userAddress}</small>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Passport Verifiers Management</h1>

      {/* Add Verifier Section */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Add Trusted Verifier</h2>
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="0x... Verifier Address"
            value={newVerifier}
            onChange={(e) => setNewVerifier(e.target.value)}
            className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAddVerifier}
            disabled={isAddingVerifier || !newVerifier}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {isAddingVerifier ? 'Adding...' : 'Add Verifier'}
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Trusted verifiers can approve passport location verification proofs.
        </p>
      </div>

      {/* Remove Verifier Section */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Remove Trusted Verifier</h2>
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="0x... Verifier Address"
            value={verifierToRemove}
            onChange={(e) => setVerifierToRemove(e.target.value)}
            className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleRemoveVerifier}
            disabled={isRemovingVerifier || !verifierToRemove}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {isRemovingVerifier ? 'Removing...' : 'Remove Verifier'}
          </button>
        </div>
      </div>

      {/* Check Verifier Status */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Check Verifier Status</h2>
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            placeholder="0x... Address to Check"
            value={checkAddress}
            onChange={(e) => setCheckAddress(e.target.value)}
            className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => checkVerifier()}
            disabled={!checkAddress}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Check Status
          </button>
        </div>
        {checkAddress && (
          <div className={`p-4 rounded-lg ${isVerifier ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
            <strong>Status:</strong> {isVerifier ? '✅ Trusted Verifier' : '❌ Not a Verifier'}
          </div>
        )}
      </div>

      {/* Contract Info */}
      <div className="bg-gray-50 rounded-lg p-4 mt-6">
        <h3 className="font-semibold mb-2">Contract Info</h3>
        <p className="text-sm text-gray-600">
          PassportNFT: <code className="bg-gray-200 px-2 py-1 rounded">{PASSPORT_ADDRESS}</code>
        </p>
        <p className="text-sm text-gray-600 mt-1">
          Owner: <code className="bg-gray-200 px-2 py-1 rounded">{ownerAddress}</code>
        </p>
      </div>
    </div>
  )
}
