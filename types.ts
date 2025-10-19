export interface ItineraryDraft {
  data?: {
    destination: string;
    interests: string;
    climbingPhoto?: string | null;
    climbingGrade?: string;
  };
  encrypted: number[];
  iv: number[];
  key: number[];
}

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// Add this for window.ethereum support
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on?: (event: string, handler: (...args: any[]) => void) => void;
      removeListener?: (event: string, handler: (...args: any[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

export {};
