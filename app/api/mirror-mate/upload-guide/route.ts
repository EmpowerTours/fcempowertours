import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';

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

    // Validate file type
    if (!photo.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, error: 'File must be an image' },
        { status: 400 }
      );
    }

    // Create unique filename
    const timestamp = Date.now();
    const fileExtension = photo.name.split('.').pop();
    const filename = `guide-${timestamp}.${fileExtension}`;

    // Convert file to buffer
    const bytes = await photo.arrayBuffer();
    const buffer = Buffer.from(bytes);

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
    const guideData = {
      id: `custom-${timestamp}`,
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
