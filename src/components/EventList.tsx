'use client';

import { useState } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSmartEventManifest } from '../hooks/useSmartEventManifest';
import { toast } from 'sonner';

interface Event {
  name: string;
  location: string;
  startDate: bigint;
  endDate: bigint;
  capacity: bigint;
  ticketsSold: bigint;
  price: bigint;
  metadataUri: string;
  isActive: boolean;
}

export function EventList() {
  const { walletAddress } = useFarcasterContext();
  const {
    purchaseTicket,
    isPending,
    isConfirming,
    useGetActiveEvents,
    useGetEvent,
  } = useSmartEventManifest();

  const { data: activeEventIds } = useGetActiveEvents();
  const [selectedEventId, setSelectedEventId] = useState<bigint | null>(null);

  const { data: selectedEvent } = useGetEvent(selectedEventId || 0n);

  // Type assertion for activeEventIds as array of event IDs
  const typedActiveEventIds = activeEventIds as bigint[] | undefined;

  const handlePurchaseTicket = async (eventId: bigint, quantity: bigint) => {
    if (!walletAddress) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      toast.loading('Purchasing ticket...');

      // Call delegation API for gasless ticket purchase
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'purchase_event_ticket',
          params: {
            eventId: eventId.toString(),
            quantity: quantity.toString()
          }
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Ticket purchase failed');
      }

      toast.dismiss();
      toast.success(`Purchased ticket for Event #${eventId}! (Gasless)`);
    } catch (error: any) {
      console.error('Error purchasing ticket:', error);
      toast.dismiss();
      toast.error(error.message || 'Failed to purchase ticket');
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold mb-6">Events</h2>

      {typedActiveEventIds && typedActiveEventIds.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {typedActiveEventIds.map((eventId: bigint, index: number) => {
            // Note: In a real app, you'd fetch each event's data individually
            // or use a batch query. For simplicity, we're showing placeholders here.
            return (
              <Card
                key={index}
                className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setSelectedEventId(eventId)}
              >
                <div className="aspect-video bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg mb-4 flex items-center justify-center">
                  <div className="text-white text-4xl">🎉</div>
                </div>

                <h3 className="font-bold text-lg mb-2">Event #{eventId.toString()}</h3>

                {selectedEventId === eventId && selectedEvent ? (
                  <div className="space-y-2">
                    <div className="text-sm">
                      <span className="text-gray-600">Name:</span>{' '}
                      <span className="font-medium">{(selectedEvent as Event).name}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-600">Location:</span>{' '}
                      <span className="font-medium">{(selectedEvent as Event).location}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-600">Price:</span>{' '}
                      <span className="font-medium">
                        {((selectedEvent as Event).price / 1000000000000000000n).toString()} TOURS
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-600">Available:</span>{' '}
                      <span className="font-medium">
                        {((selectedEvent as Event).capacity - (selectedEvent as Event).ticketsSold).toString()}/
                        {(selectedEvent as Event).capacity.toString()}
                      </span>
                    </div>

                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePurchaseTicket(eventId, 1n);
                      }}
                      disabled={!walletAddress || isPending || isConfirming}
                      className="w-full mt-4"
                    >
                      {isPending || isConfirming ? 'Purchasing...' : 'Buy Ticket'}
                    </Button>
                  </div>
                ) : null}

                {selectedEventId !== eventId && (
                  <div className="text-sm text-gray-600">
                    Click to view details
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-12">
          <div className="text-center">
            <div className="text-6xl mb-4">🎫</div>
            <h3 className="text-xl font-bold mb-2">No Active Events</h3>
            <p className="text-gray-600">
              Check back soon for upcoming events!
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
