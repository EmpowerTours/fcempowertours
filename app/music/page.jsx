export const dynamic = 'force-dynamic';
import MusicClientWrapper from "./client";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { getConfig } from "./config";  // Change to static import

export default function Page() {  // Remove async unless you need it for other reasons
  const config = getConfig();
  const initialState = cookieToInitialState(config, headers().get("cookie"));
  return <MusicClientWrapper initialState={initialState} />;
}
