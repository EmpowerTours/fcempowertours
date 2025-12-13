'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function UploadGuidePage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: '',
    age: '',
    location: '',
    bio: '',
    languages: '',
  });

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!photoFile) {
      alert('Please upload a photo');
      return;
    }

    setUploading(true);

    try {
      // Create form data
      const uploadData = new FormData();
      uploadData.append('photo', photoFile);
      uploadData.append('name', formData.name);
      uploadData.append('age', formData.age);
      uploadData.append('location', formData.location);
      uploadData.append('bio', formData.bio);
      uploadData.append('languages', formData.languages);

      const response = await fetch('/api/mirror-mate/upload-guide', {
        method: 'POST',
        body: uploadData,
      });

      const data = await response.json();

      if (data.success) {
        setUploadSuccess(true);
        setTimeout(() => {
          router.push('/mirror-mate');
        }, 2000);
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Upload failed:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  if (uploadSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center px-4">
        <div className="max-w-md bg-black/60 backdrop-blur-lg rounded-3xl p-8 border border-green-500/30 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-3xl font-bold text-white mb-4">Guide Uploaded!</h2>
          <p className="text-gray-300 mb-6">
            Your travel guide profile has been added to MirrorMate.
          </p>
          <p className="text-sm text-gray-400">
            Redirecting to MirrorMate...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-black/60 backdrop-blur-lg rounded-3xl p-8 border border-pink-500/30">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-white">Upload Travel Guide</h1>
            <button
              onClick={() => router.back()}
              className="text-gray-400 hover:text-white"
            >
              ← Back
            </button>
          </div>

          <p className="text-gray-400 mb-8">
            Add a custom travel guide profile with a real person's photo and details.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Photo Upload */}
            <div>
              <label className="block text-white font-semibold mb-2">
                Profile Photo *
              </label>
              <p className="text-sm text-gray-400 mb-3">
                Upload a clear photo showing the guide's face
              </p>

              {photoPreview && (
                <div className="relative w-48 h-48 mb-4 mx-auto rounded-2xl overflow-hidden border-4 border-pink-500">
                  <Image
                    src={photoPreview}
                    alt="Preview"
                    fill
                    className="object-cover"
                  />
                </div>
              )}

              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
                id="photo-upload"
                required
              />

              <label
                htmlFor="photo-upload"
                className="block w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold text-center cursor-pointer hover:from-purple-700 hover:to-pink-700 transition-all"
              >
                📸 {photoFile ? 'Change Photo' : 'Upload Photo'}
              </label>

              {photoFile && (
                <p className="text-sm text-green-400 mt-2 text-center">
                  ✓ {photoFile.name}
                </p>
              )}
            </div>

            {/* Name */}
            <div>
              <label className="block text-white font-semibold mb-2">
                Full Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white focus:border-pink-500 focus:outline-none"
                placeholder="Maria Santos"
                required
              />
            </div>

            {/* Age */}
            <div>
              <label className="block text-white font-semibold mb-2">
                Age (optional)
              </label>
              <input
                type="number"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white focus:border-pink-500 focus:outline-none"
                placeholder="29"
                min="18"
                max="99"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-white font-semibold mb-2">
                Location *
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white focus:border-pink-500 focus:outline-none"
                placeholder="Lisbon, Portugal"
                required
              />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-white font-semibold mb-2">
                Bio *
              </label>
              <textarea
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white focus:border-pink-500 focus:outline-none h-32 resize-none"
                placeholder="Tell travelers what makes this guide special..."
                required
              />
            </div>

            {/* Languages */}
            <div>
              <label className="block text-white font-semibold mb-2">
                Languages *
              </label>
              <input
                type="text"
                value={formData.languages}
                onChange={(e) => setFormData({ ...formData, languages: e.target.value })}
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white focus:border-pink-500 focus:outline-none"
                placeholder="English, Portuguese, Spanish"
                required
              />
              <p className="text-sm text-gray-400 mt-1">
                Separate multiple languages with commas
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={uploading}
              className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-xl font-bold text-lg hover:from-pink-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? 'Uploading...' : 'Upload Guide Profile'}
            </button>
          </form>

          <div className="mt-6 p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-xl">
            <p className="text-yellow-300 text-sm">
              <strong>Note:</strong> Make sure you have permission to use the person's photo and information.
              All uploaded profiles are subject to review.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
