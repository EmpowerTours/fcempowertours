import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { encryptDocument, hashDocument } from '@/lib/encryption';
import {
  createVerificationDocument,
  VerificationDocument,
} from '@/lib/db/verificationDocuments';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const file = formData.get('file') as File;
    const assistantAddress = formData.get('assistantAddress') as string;
    const documentType = formData.get('documentType') as
      | 'government_id'
      | 'proof_of_identity'
      | 'web3_verification';

    // Validation
    if (!file || !assistantAddress || !documentType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only images and PDFs allowed' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum 10MB' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate hash BEFORE encryption (for on-chain storage)
    const documentHash = hashDocument(buffer);

    // Encrypt the document
    const { encryptedData, iv, authTag } = encryptDocument(buffer);

    // Create verification document record
    const verificationDoc: VerificationDocument = {
      id: uuidv4(),
      assistantAddress: assistantAddress.toLowerCase(),
      documentType,
      encryptedData: `${encryptedData}:${authTag}`, // Store with auth tag
      encryptionIV: iv,
      documentHash,
      mimeType: file.type,
      uploadedAt: new Date(),
      verificationStatus: 'pending',
    };

    // Save to database
    createVerificationDocument(verificationDoc);

    // Return the hash for on-chain storage
    return NextResponse.json({
      success: true,
      documentId: verificationDoc.id,
      documentHash, // Store this in PersonalAssistant contract
      message: 'Document encrypted and stored securely',
    });
  } catch (error) {
    console.error('Error uploading verification document:', error);
    return NextResponse.json(
      { error: 'Failed to process verification document' },
      { status: 500 }
    );
  }
}
