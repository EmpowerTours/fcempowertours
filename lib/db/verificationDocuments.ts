// Database schema and utilities for encrypted verification documents

export interface VerificationDocument {
  id: string;
  assistantAddress: string;
  documentType: 'government_id' | 'proof_of_identity' | 'web3_verification';
  encryptedData: string; // AES-256 encrypted document
  encryptionIV: string; // Initialization vector for decryption
  documentHash: string; // SHA-256 hash stored on-chain
  mimeType: string;
  uploadedAt: Date;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
}

// In-memory storage for demo (replace with actual database in production)
const verificationDocuments: Map<string, VerificationDocument> = new Map();

export const createVerificationDocument = (doc: VerificationDocument): void => {
  verificationDocuments.set(doc.id, doc);
};

export const getVerificationDocument = (id: string): VerificationDocument | undefined => {
  return verificationDocuments.get(id);
};

export const getDocumentsByAddress = (address: string): VerificationDocument[] => {
  return Array.from(verificationDocuments.values()).filter(
    (doc) => doc.assistantAddress.toLowerCase() === address.toLowerCase()
  );
};

export const getPendingDocuments = (): VerificationDocument[] => {
  return Array.from(verificationDocuments.values()).filter(
    (doc) => doc.verificationStatus === 'pending'
  );
};

export const updateDocumentStatus = (
  id: string,
  status: 'approved' | 'rejected',
  reviewedBy: string,
  notes?: string
): boolean => {
  const doc = verificationDocuments.get(id);
  if (!doc) return false;

  doc.verificationStatus = status;
  doc.reviewedBy = reviewedBy;
  doc.reviewedAt = new Date();
  if (notes) doc.reviewNotes = notes;

  verificationDocuments.set(id, doc);
  return true;
};
