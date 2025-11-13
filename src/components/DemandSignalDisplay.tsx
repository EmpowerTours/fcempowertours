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

  const typedTopEvents = topEvents as [bigint[], bigint[]] | undefined;
  const { data: selectedEventDemand } = useGetDemandSignal(
    selectedEventId || 0n
  );
  const typedSelectedEventDemand = selectedEventDemand as
    | [bigint, bigint]
    | undefined;

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
      toast.loading('Submitting demand signal...');

      // Call delegation API for gasless demand signal
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'submit_demand_signal',
          params: {
            eventId: eventId.toString(),
            amount: demandAmount
          }
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Demand signal submission failed');
      }

      toast.dismiss();
      toast.success(`Submitted demand signal for Event #${eventId}! (Gasless)`);
      setDemandAmount('');
    } catch (error: any) {
      console.error('Error submitting demand:', error);
      toast.dismiss();
      toast.error(error.message || 'Failed to submit demand signal');
    }
  };

  const handleWithdrawDemand = async (eventId: bigint) => {
    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      toast.loading('Withdrawing demand signal...');

      // Call delegation API for gasless demand withdrawal
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'withdraw_demand_signal',
          params: {
            eventId: eventId.toString()
          }
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Demand signal withdrawal failed');
      }

      toast.dismiss();
      toast.success(`Withdrew demand signal for Event #${eventId}! (Gasless)`);
    } catch (error: any) {
      console.error('Error withdrawing demand:', error);
      toast.dismiss();
      toast.error(error.message || 'Failed to withdraw demand signal');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Demand Signals</h2>

      {/* Top Events */}
      <Card className="p-6">
        <h3 className="text-xl font-bold mb-4">Top Demand Events</h3>
        {typedTopEvents && typedTopEvents[0] && typedTopEvents[0].length > 0 ? (
          <div className="space-y-3">
            {typedTopEvents[0].map((eventId: bigint, index: number) => {
              const demand = typedTopEvents[1]?.[index] || 0n;
              return (
                <div
                  key={index}
                  className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedEventId(eventId)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-semibold">
                        Event #{eventId.toString()}
                      </div>
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

        {selectedEventId !== null && typedSelectedEventDemand && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <div className="text-sm font-medium">
              Event #{selectedEventId.toString()}
            </div>
            <div className="text-xs text-gray-600">
              Total Demand:{' '}
              {typedSelectedEventDemand[0]
                ? (Number(typedSelectedEventDemand[0]) / 1e18).toFixed(2)
                : '0'}{' '}
              TOURS
            </div>
            <div className="text-xs text-gray-600">
              Signals: {typedSelectedEventDemand[1]?.toString() || '0'}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Event ID</label>
            <Input
              type="number"
              value={selectedEventId?.toString() || ''}
              onChange={(e) =>
                setSelectedEventId(
                  e.target.value ? BigInt(e.target.value) : null
                )
              }
              placeholder="Enter event ID"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Demand Amount (TOURS)
            </label>
            <Input
              type="number"
              step="0.000001"
              value={demandAmount}
              onChange={(e) => setDemandAmount(e.target.value)}
              placeholder="0.0"
            />
          </div>

          <Button
            onClick={() =>
              selectedEventId && handleSubmitDemand(selectedEventId)
            }
            disabled={
              !address ||
              isPending ||
              isConfirming ||
              !selectedEventId ||
              !demandAmount
            }
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
          <p>
            💡 Demand signals help event organizers understand interest levels
            and make data-driven decisions.
          </p>
        </div>
      </Card>
    </div>
  );
}
