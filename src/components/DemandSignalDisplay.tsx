'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDemandSignalEngine } from '../hooks/useDemandSignalEngine';
import { toast } from 'sonner';
import { parseUnits } from 'viem';

export function DemandSignalDisplay() {
  const { address } = useAccount();
  const {
    submitDemand,
    withdrawDemand,
    isPending,
    isConfirming,
    useGetTopEvents,
    useGetDemandSignal,
  } = useDemandSignalEngine();

  const { data: topEvents } = useGetTopEvents(10n);
  const [selectedEventId, setSelectedEventId] = useState<bigint | null>(null);
  const [demandAmount, setDemandAmount] = useState('');

  const { data: selectedEventDemand } = useGetDemandSignal(selectedEventId || 0n);

  const handleSubmitDemand = async (eventId: bigint) => {
    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!demandAmount || parseFloat(demandAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      const amount = parseUnits(demandAmount, 18);
      submitDemand(eventId, amount);
      toast.success('Submitting demand signal...');
      setDemandAmount('');
    } catch (error) {
      console.error('Error submitting demand:', error);
      toast.error('Failed to submit demand signal');
    }
  };

  const handleWithdrawDemand = async (eventId: bigint) => {
    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      withdrawDemand(eventId);
      toast.success('Withdrawing demand signal...');
    } catch (error) {
      console.error('Error withdrawing demand:', error);
      toast.error('Failed to withdraw demand signal');
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold mb-6">Demand Signals</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Events */}
        <Card className="p-6">
          <h3 className="text-xl font-bold mb-4">Top Demand Events</h3>

          {topEvents && Array.isArray(topEvents) && topEvents[0] && Array.isArray(topEvents[0]) && topEvents[0].length > 0 ? (
            <div className="space-y-3">
              {topEvents[0].map((eventId: bigint, index: number) => {
                const demand = topEvents[1] && Array.isArray(topEvents[1]) ? topEvents[1][index] : 0n;
                return (
                  <div
                    key={index}
                    className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedEventId(eventId)}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-semibold">Event #{eventId.toString()}</div>
                        <div className="text-sm text-gray-600">
                          {demand ? (Number(demand) / 1e18).toFixed(2) : '0'} TOURS
                        </div>
                      </div>
                      <div className="text-2xl">📊</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-600 text-center py-8">
              No demand signals yet. Be the first to signal!
            </p>
          )}
        </Card>

        {/* Submit Demand */}
        <Card className="p-6">
          <h3 className="text-xl font-bold mb-4">Submit Demand Signal</h3>

          {selectedEventId !== null && selectedEventDemand && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <div className="text-sm font-medium">Event #{selectedEventId.toString()}</div>
              <div className="text-xs text-gray-600">
                Total Demand: {selectedEventDemand[0] ? (Number(selectedEventDemand[0]) / 1e18).toFixed(2) : '0'} TOURS
              </div>
              <div className="text-xs text-gray-600">
                Signals: {selectedEventDemand[1] ? selectedEventDemand[1].toString() : '0'}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Event ID</label>
              <Input
                type="number"
                value={selectedEventId?.toString() || ''}
                onChange={(e) => setSelectedEventId(e.target.value ? BigInt(e.target.value) : null)}
                placeholder="Enter event ID"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Demand Amount (TOURS)</label>
              <Input
                type="number"
                step="0.000001"
                value={demandAmount}
                onChange={(e) => setDemandAmount(e.target.value)}
                placeholder="0.0"
              />
            </div>

            <Button
              onClick={() => selectedEventId && handleSubmitDemand(selectedEventId)}
              disabled={!address || isPending || isConfirming || !selectedEventId || !demandAmount}
              className="w-full"
            >
              {isPending || isConfirming ? 'Submitting...' : 'Submit Demand'}
            </Button>

            {selectedEventId && (
              <Button
                onClick={() => handleWithdrawDemand(selectedEventId)}
                disabled={!address || isPending || isConfirming}
                variant="outline"
                className="w-full"
              >
                Withdraw Demand
              </Button>
            )}
          </div>

          <div className="mt-6 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
            <p>💡 Demand signals help event organizers understand interest levels and make data-driven decisions.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
