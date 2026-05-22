export type LiveKitEnvStatus = {
  apiKey: boolean;
  apiSecret: boolean;
  url: boolean;
};

type LiveKitEnvDiagnostics = {
  apiKey: string | undefined;
  apiSecret: string | undefined;
  status: LiveKitEnvStatus;
  url: string | undefined;
};

function maskValue(value: string | undefined) {
  if (!value) return "missing";
  return `${value.slice(0, 6)}...`;
}

export function getLiveKitEnvDiagnostics(source: string): LiveKitEnvDiagnostics {
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const status = {
    apiKey: Boolean(apiKey),
    apiSecret: Boolean(apiSecret),
    url: Boolean(url),
  };

  console.log(`[Matchr LiveKit env] ${source}`, {
    LIVEKIT_API_KEY: {
      exists: status.apiKey,
      masked: maskValue(apiKey),
    },
    LIVEKIT_API_SECRET: {
      exists: status.apiSecret,
      masked: maskValue(apiSecret),
    },
    NEXT_PUBLIC_LIVEKIT_URL: {
      exists: status.url,
      masked: maskValue(url),
    },
  });

  return {
    apiKey,
    apiSecret,
    status,
    url,
  };
}
