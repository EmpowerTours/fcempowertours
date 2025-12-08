import { NextRequest, NextResponse } from 'next/server';
import { decryptDocument } from '@/lib/encryption';
import {
  getPendingDocuments,
  getVerificationDocument,
  updateDocumentStatus,
} from '@/lib/db/verificationDocuments';
import { recoverMessageAddress } from 'viem';

const PLATFORM_OWNER = process.env.PLATFORM_SAFE_ADDRESS?.toLowerCase();

/**
 * Verify that the request is from the platform owner
 */
async function verifyOwnerSignature(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  try {
    const recoveredAddress = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    });

    return recoveredAddress.toLowerCase() === PLATFORM_OWNER;
  } catch {
    return false;
  }
}

/**
 * GET: Fetch all pending verification documents (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const address = request.headers.get('x-wallet-address');
    const signature = request.headers.get('x-signature');
    const message = request.headers.get('x-message');

    if (!address || !signature || !message) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify owner signature
    const isOwner = await verifyOwnerSignature(address, message, signature);
    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch pending documents
    const pendingDocs = getPendingDocuments();

    // Return metadata only (no encrypted data)
    const sanitizedDocs = pendingDocs.map((doc) => ({
      id: doc.id,
      assistantAddress: doc.assistantAddress,
      documentType: doc.documentType,
      uploadedAt: doc.uploadedAt,
      mimeType: doc.mimeType,
    }));

    return NextResponse.json({ documents: sanitizedDocs });
  } catch (error) {
    console.error('Error fetching pending documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}

/**
 * POST: Decrypt and view a specific document (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentId, action, address, signature, message } = body;

    if (!address || !signature || !message) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify owner signature
    const isOwner = await verifyOwnerSignature(address, message, signature);
    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const doc = getVerificationDocument(documentId);
    if (!doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // If action is to decrypt and view
    if (action === 'view') {
      // Split encrypted data and auth tag
      const [encryptedData, authTag] = doc.encryptedData.split(':');

      // Decrypt the document
      const decryptedBuffer = decryptDocument(
        encryptedData,
        doc.encryptionIV,
        authTag
      );

      // Return as base64 for display in admin panel
      return NextResponse.json({
        documentId: doc.id,
        assistantAddress: doc.assistantAddress,
        documentType: doc.documentType,
        mimeType: doc.mimeType,
        decryptedData: decryptedBuffer.toString('base64'),
        uploadedAt: doc.uploadedAt,
      });
    }

    // If action is to approve/reject
    if (action === 'approve' || action === 'reject') {
      const status = action === 'approve' ? 'approved' : 'rejected';
      const notes = body.notes || '';

      const updated = updateDocumentStatus(documentId, status, address, notes);

      if (!updated) {
        return NextResponse.json(
          { error: 'Failed to update document' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Document ${status}`,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error processing document review:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
