const FREEPIK_API = "https://api.freepik.com/v1";

export interface FreepikAsset {
  id: string;
  title: string;
  preview_url: string;
  download_url?: string;
  type: "photo" | "vector" | "video";
}

export async function searchRealEstateAssets(
  query: string,
  type: "photo" | "video" = "photo",
  limit = 5
): Promise<FreepikAsset[]> {
  const params = new URLSearchParams({
    term: query,
    type,
    limit: String(limit),
    order: "relevance",
    filters_content_type: type === "video" ? "video" : "photo",
  });

  const res = await fetch(`${FREEPIK_API}/resources?${params}`, {
    headers: {
      "x-freepik-api-key": process.env.FREEPIK_API_KEY!,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    console.warn(`Freepik search failed: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const items = data.data || [];

  return items.slice(0, limit).map((item: Record<string, unknown>) => ({
    id: String(item.id),
    title: String((item as { title?: string }).title || ""),
    preview_url: String(((item as { thumbnails?: Array<{ url?: string }> }).thumbnails?.[0]?.url) || ""),
    type,
  }));
}
