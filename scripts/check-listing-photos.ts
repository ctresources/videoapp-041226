/**
 * Checks for lib/utils/listing-photos.ts.
 *
 * Run with:  node --experimental-strip-types scripts/check-listing-photos.ts
 *
 * No test runner, no browser, no network — the extractor is a pure function, so
 * the whole listing-photo path can be verified from a terminal (or from a
 * phone, via a session like this one). Prints a summary and exits non-zero on
 * the first failure.
 */

import { extractImageUrls } from "../lib/utils/listing-photos.ts";

const PAGE = "https://www.example-idx.com/listings/123-main-st";

let failures = 0;

function check(name: string, markdown: string, expected: string[]) {
  const actual = extractImageUrls(markdown, PAGE);
  const ok =
    actual.length === expected.length &&
    actual.every((url, i) => url === expected[i]);
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}`);
    console.log(`       expected ${JSON.stringify(expected, null, 2)}`);
    console.log(`       actual   ${JSON.stringify(actual, null, 2)}`);
  }
}

console.log("listing photo extraction");

check(
  "relative paths resolve against the page URL",
  `![Front](/photos/front.jpg)`,
  ["https://www.example-idx.com/photos/front.jpg"],
);

check(
  "one photo at several sizes counts once, largest-listed wins order",
  `![a](https://cdn.test/p/1.jpg?w=400) ![b](https://cdn.test/p/1.jpg?w=1600)`,
  ["https://cdn.test/p/1.jpg?w=400"],
);

check(
  "uppercase extensions are photos",
  `![a](https://cdn.test/p/KITCHEN.JPG)`,
  ["https://cdn.test/p/KITCHEN.JPG"],
);

check(
  "bare URLs in Jina's trailing Images block",
  `Images:\nhttps://cdn.test/p/2.webp\nhttps://cdn.test/p/3.avif`,
  ["https://cdn.test/p/2.webp", "https://cdn.test/p/3.avif"],
);

check(
  "page furniture is excluded",
  [
    `![Brokerage logo](https://cdn.test/brand/logo.png)`,
    `![Agent](https://cdn.test/agents/headshot-jane.jpg)`,
    `![](https://cdn.test/t/pixel.gif)`,
    `![next](https://cdn.test/ui/arrow-right.png)`,
    `![](https://cdn.test/favicon.png)`,
    `![Living room](https://cdn.test/p/living.jpg)`,
  ].join("\n"),
  ["https://cdn.test/p/living.jpg"],
);

check(
  "documents and pages are not photos",
  `![floorplan](https://cdn.test/docs/plan.pdf) ![tour](https://cdn.test/tour.html) ![Deck](https://cdn.test/p/deck.jpg)`,
  ["https://cdn.test/p/deck.jpg"],
);

// ── Recall: a real myre.io import found only 2 photos on a 34k-char page ──────

check(
  "extension-less CDN URLs count, because ![…] already says it is an image",
  `![Photo 1](https://cdn.test/image/upload/v1720/abc123)`,
  ["https://cdn.test/image/upload/v1720/abc123"],
);

check(
  "a bare extension-less URL is still ignored — nothing says it is an image",
  `See https://www.example-idx.com/listings/123-main-st/gallery for more`,
  [],
);

check(
  "extension-less photos are told apart by their query, not collapsed",
  `![1](https://cdn.test/img?id=7&w=800) ![2](https://cdn.test/img?id=8&w=800)`,
  ["https://cdn.test/img?id=7&w=800", "https://cdn.test/img?id=8&w=800"],
);

check(
  "Next.js image proxy is unwrapped to the photo it wraps",
  `![Kitchen](/_next/image?url=https%3A%2F%2Fcdn.test%2Fp%2Fkitchen.jpg&w=1200&q=75)`,
  ["https://cdn.test/p/kitchen.jpg"],
);

check(
  "a proxied relative photo resolves against the page URL",
  `![Yard](/_next/image?url=%2Fphotos%2Fyard.jpg&w=640)`,
  ["https://www.example-idx.com/photos/yard.jpg"],
);

check(
  "the same photo behind and beside the proxy counts once",
  `![a](/_next/image?url=https%3A%2F%2Fcdn.test%2Fp%2Fden.jpg&w=640)\nhttps://cdn.test/p/den.jpg`,
  ["https://cdn.test/p/den.jpg"],
);

check(
  "raw <img> markup left in the markdown",
  `<img class="gallery" src="https://cdn.test/p/bath.jpg" alt="Bath">`,
  ["https://cdn.test/p/bath.jpg"],
);

check(
  "vector and animated assets are never listing photos",
  `![](https://cdn.test/p/map.svg) ![](https://cdn.test/p/loading.gif) ![Porch](https://cdn.test/p/porch.jpg)`,
  ["https://cdn.test/p/porch.jpg"],
);

check(
  "at most 12 photos, in page order",
  Array.from({ length: 20 }, (_, i) => `![p${i}](https://cdn.test/p/${i}.jpg)`).join("\n"),
  Array.from({ length: 12 }, (_, i) => `https://cdn.test/p/${i}.jpg`),
);

check("a page with no images yields none", `# 123 Main St\n\n4 beds, 3 baths.`, []);

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
