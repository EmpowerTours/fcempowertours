export interface ItineraryDraft {
  // Keep data if used elsewhere, but make optional for this storage case
  data?: {
    destination: string;
    interests: string;
    climbingPhoto?: string | null;
    climbingGrade?: string;
  };
  encrypted: number[];  // Array of bytes for exact binary storage
  iv: number[];
  key: number[];  // Add this for the exported symmetric key
}

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
