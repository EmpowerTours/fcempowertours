'use client';

import { TandaGroup } from '@/src/components/TandaGroup';

export default function TandaPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">🤝 Tanda Groups</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Join rotating savings and credit groups to access community lending and build your credit score
          </p>
        </div>

        <TandaGroup />
      </div>
    </div>
  );
}
