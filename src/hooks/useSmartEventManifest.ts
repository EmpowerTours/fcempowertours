import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { smartEventManifestConfig } from '../config/contracts';

export function useSmartEventManifest() {
  const { data: hash, writeContract, isPending, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Read functions
  const useGetEvent = (eventId: bigint) => {
    return useReadContract({
      ...smartEventManifestConfig,
      functionName: 'getEvent',
      args: [eventId],
    });
  };

  const useGetAllEvents = () => {
    return useReadContract({
      ...smartEventManifestConfig,
      functionName: 'getAllEvents',
    });
  };

  const useGetActiveEvents = () => {
    return useReadContract({
      ...smartEventManifestConfig,
      functionName: 'getActiveEvents',
    });
  };

  // Write functions
  const createEvent = (
    name: string,
    location: string,
    startDate: bigint,
    endDate: bigint,
    capacity: bigint,
    price: bigint,
    metadataUri: string
  ) => {
    writeContract({
      ...smartEventManifestConfig,
      functionName: 'createEvent',
      args: [name, location, startDate, endDate, capacity, price, metadataUri],
    });
  };

  const purchaseTicket = (eventId: bigint, quantity: bigint) => {
    writeContract({
      ...smartEventManifestConfig,
      functionName: 'purchaseTicket',
      args: [eventId, quantity],
    });
  };

  const updateEvent = (
    eventId: bigint,
    name: string,
    location: string,
    startDate: bigint,
    endDate: bigint
  ) => {
    writeContract({
      ...smartEventManifestConfig,
      functionName: 'updateEvent',
      args: [eventId, name, location, startDate, endDate],
    });
  };

  const cancelEvent = (eventId: bigint) => {
    writeContract({
      ...smartEventManifestConfig,
      functionName: 'cancelEvent',
      args: [eventId],
    });
  };

  return {
    // Read hooks
    useGetEvent,
    useGetAllEvents,
    useGetActiveEvents,

    // Write functions
    createEvent,
    purchaseTicket,
    updateEvent,
    cancelEvent,

    // Transaction state
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
  };
}
