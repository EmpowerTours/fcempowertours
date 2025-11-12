'use client';

import { EventList } from '@/src/components/EventList';
import { DemandSignalDisplay } from '@/src/components/DemandSignalDisplay';

export default function EventsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">🎉 Events & Tickets</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Discover events, purchase tickets, and signal demand for future events
          </p>
        </div>

        {/* Event List */}
        <EventList />

        {/* Demand Signals */}
        <div className="mt-12">
          <DemandSignalDisplay />
        </div>
      </div>
    </div>
  );
}
