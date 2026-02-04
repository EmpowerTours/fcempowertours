export interface TokenInfo {
  address: string;
  symbol: string;
  price: string;
  marketCap: string;
  graduated: boolean;
}

/** Get EMPTOURS token price and info from nad.fun Lens contract */
export async function getTokenInfo(): Promise<TokenInfo | null> {
  // nad.fun contracts not deployed on Monad mainnet yet - disable to prevent errors
  // TODO: Re-enable when nad.fun is live on Monad
  return null;
}
