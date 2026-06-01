import { pinterestGet } from "./pinterestClient";

interface PinDetails {
  id: string;
  created_at?: string;
}

export async function getPinCreatedAt(pinId: string): Promise<string | null> {
  try {
    const res = await pinterestGet<PinDetails>(
      `/pins/${encodeURIComponent(pinId)}?fields=id,created_at`
    );
    return res.created_at ?? null;
  } catch {
    return null;
  }
}
