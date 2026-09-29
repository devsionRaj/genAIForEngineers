import puppeteer from 'puppeteer';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compileReviewCrawler, normalizeReviewRecords } from './review-crawler.js';

const generatedCrawlerPath = fileURLToPath(
    new URL('./generated-review-crawler.js', import.meta.url)
);
const generatedReviewsPath = fileURLToPath(
    new URL('./generated-reviews.json', import.meta.url)
);
const url = process.argv[2];

if (!url) {
    throw new Error('Pass a URL: node rag-practice/run-generated-review-crawler.js <url>');
}

// Step 1: Load and compile the previously generated crawler function.
const functionSource = await readFile(generatedCrawlerPath, 'utf8');
const crawlReviews = compileReviewCrawler(functionSource);
const crawlResult = await crawlReviews({ url, puppeteer });
const reviews = normalizeReviewRecords(
    Array.isArray(crawlResult) ? crawlResult : crawlResult.reviews,
    url
);
const crawlMetadata = Array.isArray(crawlResult) ? null : crawlResult.metadata ?? null;

// Step 2: Persist this run's review data and crawl details beside the crawler.
await writeFile(generatedReviewsPath, JSON.stringify({
    source: url,
    collectedAt: new Date().toISOString(),
    count: reviews.length,
    metadata: crawlMetadata,
    reviews
}, null, 2) + '\n', 'utf8');

console.log(`Saved reviews to ${generatedReviewsPath}`);
console.log(`Collected ${reviews.length} reviews.`);