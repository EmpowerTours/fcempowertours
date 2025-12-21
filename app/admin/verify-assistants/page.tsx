'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useRouter } from 'next/navigation';

interface PendingDocument {
  id: string;
  assistantAddress: string;
  documentType: 'government_id' | 'proof_of_identity' | 'web3_verification';
  uploadedAt: string;
  mimeType: string;
}

interface DecryptedDocument extends PendingDocument {
  decryptedData: string;
}

const PLATFORM_OWNER = process.env.NEXT_PUBLIC_PLATFORM_SAFE_ADDRESS;

export default function VerifyAssistantsPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [pendingDocs, setPendingDocs] = useState<PendingDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DecryptedDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingDoc, setViewingDoc] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');

  useEffect(() => {
    if (address?.toLowerCase() === PLATFORM_OWNER?.toLowerCase()) {
      fetchPendingDocuments();
    }
  }, [address]);

  const fetchPendingDocuments = async () => {
    if (!address) return;

    try {
      setLoading(true);

      // Sign a message to prove ownership
      const message = `Verify platform owner access at ${Date.now()}`;
      const signature = await signMessageAsync({ message });

      const response = await fetch('/api/admin/review-verification', {
        method: 'GET',
        headers: {
          'x-wallet-address': address,
          'x-signature': signature,
          'x-message': message,
        },
      });

      const data = await response.json();

      if (data.documents) {
        setPendingDocs(data.documents);
      }
    } catch (error) {
      console.error('Failed to fetch pending documents:', error);
      alert('Failed to load pending verifications');
    } finally {
      setLoading(false);
    }
  };

  const viewDocument = async (documentId: string) => {
    if (!address) return;

    try {
      setViewingDoc(true);

      // Sign a message to prove ownership
      const message = `Decrypt document ${documentId} at ${Date.now()}`;
      const signature = await signMessageAsync({ message });

      const response = await fetch('/api/admin/review-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          action: 'view',
          address,
          signature,
          message,
        }),
      });

      const data = await response.json();

      if (data.decryptedData) {
        setSelectedDoc(data);
      }
    } catch (error) {
      console.error('Failed to decrypt document:', error);
      alert('Failed to view document');
    } finally {
      setViewingDoc(false);
    }
  };

  const reviewDocument = async (documentId: string, action: 'approve' | 'reject') => {
    if (!address) return;

    try {
      // Sign a message to prove ownership
      const message = `${action} document ${documentId} at ${Date.now()}`;
      const signature = await signMessageAsync({ message });

      const response = await fetch('/api/admin/review-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          action,
          address,
          signature,
          message,
          notes: reviewNotes,
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert(`Document ${action}d successfully!`);
        setSelectedDoc(null);
        setReviewNotes('');
        fetchPendingDocuments(); // Refresh list
      }
    } catch (error) {
      console.error(`Failed to ${action} document:`, error);
      alert(`Failed to ${action} document`);
    }
  };

  // Check if user is platform owner
  if (address?.toLowerCase() !== PLATFORM_OWNER?.toLowerCase()) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-gray-400">This page is only accessible to the platform owner</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => router.back()}
          className="mb-4 text-gray-400 hover:text-white"
        >
          ← Back
        </button>

        <h1 className="text-4xl font-bold mb-2">Verify Assistants</h1>
        <p className="text-gray-400 mb-8">
          Review and approve assistant verification applications
        </p>

        {loading ? (
          <div className="text-center py-12">
            <div className="text-gray-400">Loading pending verifications...</div>
          </div>
        ) : pendingDocs.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4">✓</div>
            <h2 className="text-xl font-bold mb-2">All Caught Up!</h2>
            <p className="text-gray-400">No pending verification applications</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pending Documents List */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold mb-4">
                Pending Applications ({pendingDocs.length})
              </h2>

              {pendingDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="bg-gray-800 rounded-xl p-6 hover:bg-gray-750 transition cursor-pointer"
                  onClick={() => viewDocument(doc.id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-mono text-sm text-gray-400 mb-1">
                        {doc.assistantAddress.slice(0, 6)}...{doc.assistantAddress.slice(-4)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(doc.uploadedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-2xl">
                      {doc.documentType === 'government_id' && '🆔'}
                      {doc.documentType === 'web3_verification' && '🌐'}
                      {doc.documentType === 'proof_of_identity' && '📋'}
                    </div>
                  </div>

                  <div className="text-sm">
                    <span className="bg-blue-600/20 text-blue-400 px-2 py-1 rounded text-xs">
                      {doc.documentType.replace('_', ' ')}
                    </span>
                  </div>

                  <button className="mt-4 w-full bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg font-semibold text-sm">
                    View Document
                  </button>
                </div>
              ))}
            </div>

            {/* Document Viewer */}
            <div className="sticky top-6 h-fit">
              {viewingDoc ? (
                <div className="bg-gray-800 rounded-xl p-12 text-center">
                  <div className="text-gray-400">Decrypting document...</div>
                </div>
              ) : selectedDoc ? (
                <div className="bg-gray-800 rounded-xl p-6">
                  <h2 className="text-2xl font-bold mb-4">Review Document</h2>

                  <div className="mb-4">
                    <div className="text-sm text-gray-400 mb-2">Assistant Address:</div>
                    <div className="font-mono text-sm bg-gray-900 rounded px-3 py-2">
                      {selectedDoc.assistantAddress}
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="text-sm text-gray-400 mb-2">Document Type:</div>
                    <div className="text-sm">
                      <span className="bg-blue-600/20 text-blue-400 px-2 py-1 rounded">
                        {selectedDoc.documentType.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Document Preview */}
                  <div className="mb-6">
                    <div className="text-sm text-gray-400 mb-2">Document:</div>
                    {selectedDoc.mimeType.startsWith('image/') ? (
                      <img
                        src={`data:${selectedDoc.mimeType};base64,${selectedDoc.decryptedData}`}
                        alt="Verification Document"
                        className="w-full rounded-lg border border-gray-700"
                      />
                    ) : selectedDoc.mimeType === 'application/pdf' ? (
                      <div className="bg-gray-900 rounded-lg p-6 text-center">
                        <div className="text-4xl mb-2">📄</div>
                        <div className="text-sm text-gray-400">PDF Document</div>
                        <a
                          href={`data:${selectedDoc.mimeType};base64,${selectedDoc.decryptedData}`}
                          download="verification-document.pdf"
                          className="mt-3 inline-block bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm"
                        >
                          Download PDF
                        </a>
                      </div>
                    ) : (
                      <div className="bg-gray-900 rounded-lg p-6 text-center text-gray-400">
                        Unsupported file type
                      </div>
                    )}
                  </div>

                  {/* Review Notes */}
                  <div className="mb-6">
                    <label className="block text-sm text-gray-400 mb-2">
                      Review Notes (optional)
                    </label>
                    <textarea
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white h-24"
                      placeholder="Add any notes about this verification..."
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => reviewDocument(selectedDoc.id, 'reject')}
                      className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-semibold"
                    >
                      ✗ Reject
                    </button>
                    <button
                      onClick={() => reviewDocument(selectedDoc.id, 'approve')}
                      className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-semibold"
                    >
                      ✓ Approve
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-800 rounded-xl p-12 text-center">
                  <div className="text-4xl mb-4">👈</div>
                  <div className="text-gray-400">
                    Select a document from the left to review
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
