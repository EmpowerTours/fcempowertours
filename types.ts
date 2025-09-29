export interface ItineraryDraft {
  data: {
    destination: string;
    interests: string;
    climbingPhoto?: string | null;
    climbingGrade?: string;
  };
  encrypted: string;
  iv: string;
}
