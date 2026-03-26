const YOUSEARCH_API = "https://api.ydc-index.io/v1";

interface SearchResult {
  snippets: string[];
  summary: string;
}

export async function searchRealEstateContext(query: string): Promise<SearchResult> {
  const res = await fetch(
    `${YOUSEARCH_API}/search?query=${encodeURIComponent(query)}&count=5`,
    {
      headers: {
        "X-API-Key": process.env.YOUSEARCH_API_KEY!,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    // Non-fatal — return empty if search fails
    console.warn(`You.com search failed: ${res.status}`);
    return { snippets: [], summary: "" };
  }

  const data = await res.json();
  const snippets: string[] = [];

  // Extract snippets from results
  if (data.results) {
    for (const result of data.results.slice(0, 5)) {
      if (result.snippets) snippets.push(...result.snippets.slice(0, 2));
      else if (result.description) snippets.push(result.description);
    }
  }
  if (data.web?.results) {
    for (const r of data.web.results.slice(0, 3)) {
      if (r.snippet) snippets.push(r.snippet);
    }
  }

  return {
    snippets: snippets.slice(0, 8),
    summary: snippets.slice(0, 3).join(" "),
  };
}
