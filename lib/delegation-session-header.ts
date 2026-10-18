/**
 * Header name for the delegation session secret. Lives in its own module with
 * no Node imports so client code can use it without pulling node:crypto into
 * the browser bundle.
 */
export const DELEGATION_SESSION_HEADER = "x-delegation-session";
