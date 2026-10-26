/**
 * Re-exports radio payment receipts under the historical voice-note names.
 * Prefer `@/lib/radio-payment-receipt` for new call sites.
 */
export {
  recordVoiceNoteReceipt,
  consumeVoiceNoteReceipt,
  recordRadioPaymentReceipt,
  consumeRadioPaymentReceipt,
  type VoiceNoteType,
  type RadioPaymentKind,
} from "@/lib/radio-payment-receipt";
