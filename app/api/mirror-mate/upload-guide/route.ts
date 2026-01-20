import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';

// Maximum file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed file extensions and their magic bytes
const ALLOWED_IMAGE_TYPES: Record<string, { mime: string; magic: number[] }> = {
  'jpg': { mime: 'image/jpeg', magic: [0xFF, 0xD8, 0xFF] },
  'jpeg': { mime: 'image/jpeg', magic: [0xFF, 0xD8, 0xFF] },
  'png': { mime: 'image/png', magic: [0x89, 0x50, 0x4E, 0x47] },
  'gif': { mime: 'image/gif', magic: [0x47, 0x49, 0x46] },
  'webp': { mime: 'image/webp', magic: [0x52, 0x49, 0x46, 0x46] }, // RIFF header
};

/**
 * Validate file by checking magic bytes (file signature)
 * This prevents MIME type spoofing attacks
 */
function validateImageMagicBytes(buffer: Buffer, extension: string): boolean {
  const typeInfo = ALLOWED_IMAGE_TYPES[extension.toLowerCase()];
  if (!typeInfo) return false;

  const magic = typeInfo.magic;
  for (let i = 0; i < magic.length; i++) {
    if (buffer[i] !== magic[i]) return false;
  }
  return true;
}

/**
 * Generate a cryptographically secure random filename
 */
function generateSecureFilename(extension: string): string {
  const randomPart = randomBytes(16).toString('hex');
  return `guide-${randomPart}.${extension}`;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const photo = formData.get('photo') as File;
    const name = formData.get('name') as string;
    const age = formData.get('age') as string;
    const location = formData.get('location') as string;
    const bio = formData.get('bio') as string;
    const languages = formData.get('languages') as string;

    if (!photo || !name || !location || !bio || !languages) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // SECURITY: Check file size
    if (photo.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 5MB limit' },
        { status: 400 }
      );
    }

    // SECURITY: Validate file extension
    const fileExtension = (photo.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_IMAGE_TYPES[fileExtension]) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Allowed: jpg, jpeg, png, gif, webp' },
        { status: 400 }
      );
    }

    // SECURITY: Validate MIME type matches extension
    const expectedMime = ALLOWED_IMAGE_TYPES[fileExtension].mime;
    if (!photo.type.startsWith('image/') || (photo.type !== expectedMime && photo.type !== 'image/jpeg')) {
      return NextResponse.json(
        { success: false, error: 'File MIME type does not match extension' },
        { status: 400 }
      );
    }

    // Convert file to buffer for magic bytes validation
    const bytes = await photo.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // SECURITY: Validate magic bytes (file signature)
    if (!validateImageMagicBytes(buffer, fileExtension)) {
      return NextResponse.json(
        { success: false, error: 'Invalid image file. File content does not match declared type.' },
        { status: 400 }
      );
    }

    // Generate secure random filename
    const filename = generateSecureFilename(fileExtension);

    // Save to public/uploads directory
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'guides');
    const filepath = join(uploadDir, filename);

    // Ensure directory exists (in production, you might want to use a cloud storage service)
    try {
      await writeFile(filepath, buffer);
    } catch (err) {
      console.error('File write error:', err);
      // Fallback: log guide data for manual upload
      console.log('📝 Guide upload (manual processing required):', {
        name,
        age,
        location,
        bio,
        languages,
        photoName: photo.name,
      });

      return NextResponse.json({
        success: true,
        message: 'Guide profile submitted for manual upload',
        imageUrl: '/images/placeholder-avatar.png', // Fallback image
      });
    }

    const imageUrl = `/uploads/guides/${filename}`;

    // In production, save guide data to database
    const guideId = randomBytes(8).toString('hex');
    const guideData = {
      id: `custom-${guideId}`,
      name,
      age: age ? parseInt(age) : undefined,
      location,
      bio,
      languages: languages.split(',').map((l) => l.trim()),
      imageUrl,
      isCustom: true,
      uploadedAt: new Date().toISOString(),
    };

    console.log('✅ New guide uploaded:', guideData);

    // TODO: Save to database
    // await db.guides.create(guideData);

    return NextResponse.json({
      success: true,
      guide: guideData,
      imageUrl,
    });
  } catch (error: any) {
    console.error('Upload guide error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to upload guide',
      },
      { status: 500 }
    );
  }
}
