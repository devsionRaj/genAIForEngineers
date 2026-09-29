import 'dotenv/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';
import OpenAI from 'openai';
import puppeteer from 'puppeteer';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { compileReviewCrawler, normalizeReviewRecords } from './review-crawler.js';

const client = new OpenAI();
const GeneratedCrawlerResponseSchema = z.object({
    functionSource: z.string().min(1).max(30_000)
});
const generatedCrawlerPath = fileURLToPath(
    new URL('./generated-review-crawler.js', import.meta.url)
);
const generatedReviewsPath = fileURLToPath(
    new URL('./generated-reviews.json', import.meta.url)
);

async function query(userQuery) {
    // Step 1: Initialize embeddings and retrieve the webpage chunks relevant to the request.
    const embeddings = new OpenAIEmbeddings({
        model: 'text-embedding-3-small',
        apiKey: process.env.OPENAI_API_KEY
    });

    const vectorStore = await QdrantVectorStore.fromExistingCollection(
        embeddings,
        {
            url: 'http://localhost:6333',
            collectionName: 'rag-practice'
        }
    );

    const vectorRetriver = vectorStore.asRetriever({ k: 8 }); // Bring at max 5 chunks as per the user query

    // Notes for the vectorRetriever
    const NOTES = `
    Collect one review having review response necessarily. Make sure few of the collected reviews are a collection of the max possible fields. This is necessary as you will be able to generate the mappings properly then only.
    `;
    const results = await vectorRetriver.invoke(userQuery + '\n' + NOTES);

    // Step 2: Identify the source URL and ask the LLM for a documented crawler function.
    const sourceUrl = results.find((document) => document.metadata.source)?.metadata.source;
    if (!sourceUrl) {
        throw new Error('No source URL found in the retrieved documents');
    }

    const SYSTEM_PROMPT = `
You are an web crawling expert and generate perfect reusable code for crawling reviews from an webpage.

Task:-
1. Return a complete running javascript function with the following signature:
async function crawlReviews({ url, puppeteer }) { ... }
2. The function generated should mention steps in every granular place in form of comment. The comment should represent the next lines to be written.
Eg: // Step 1: Next lines work statement
..............
// Step 2: Next lines work statement
.............., etc
We sub-steps like 2a, 2b, etc whereever necessary.
3. The code should be simple and structured. It should be as DRY as possible. We should divide the code into various segments. Eg: Overall selectors(company level reviewCount, overallRatings), reviewLevelSelectors(comment, reviewerName, reviewDate, reviewResponse, etc.)
3a. The generated reviews will be in the array format and metadata section will be present in the top containing the sourceLevel details like overallRatings, reviewCount on source, etc.
4. We will pass in puppeteer as the only external dependency. Do not use anything else as it will simply break the code then and there.
5. Never use page.waitForTimeout() as its generally not present in the current puppeteer packages. If you need to use any timeout, then simply use await new Promise((resolve) => setTimeout(resolve, milliseconds)).
6. Use puppeteer for all the browser operations like page opening, waiting for networkIdle2/domcontentloaded, gathering page content, etc, wherever necessary.
7. Make sure that every returned review object must contain these keys: review_comment, review_date, reviewer_name, review_response, review_ratings, reviewId, and reviewUrl. Use null for unavailable scalar values and an empty object for unavailable ratings. Additional fields are allowed.
8. Keep the mappings intact. Means arrange the reviews with its own comment, reviewerName, reviewDate, reviewResponse, etc.
9. For reviewUrl, first capture a permalink href inside the review. If a URL is only revealed by opening the review, click its review-specific link and handle either same-tab navigation or a popup; capture that resulting URL, then return to the listing page and continue. Do not use the pagination URL as the review URL.
10. Close the browser in a finally block.
11. Keep pagination bounded to at most 10 pages and prevent revisiting URLs.

Webpage necessary embeddings are as below:-
${results.map((document) => JSON.stringify({
        pageContent: document.pageContent,
        metadata: {
            source: document.metadata.source,
            title: document.metadata.title,
            parentTagPath: document.metadata.parentTagPath
        }
    })).join('\n\n')}
`;

    // Step 3: Parse the structured response, validate and compile its function source.
    const response = await client.responses.parse({
        model: 'gpt-6-luna',
        input: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userQuery }
        ],
        text: {
            format: zodTextFormat(GeneratedCrawlerResponseSchema, 'generated_crawler')
        }
    });

    const { functionSource } = GeneratedCrawlerResponseSchema.parse(response.output_parsed);
    const crawlReviews = compileReviewCrawler(functionSource);

    // Step 4: Save the reusable source, then run it with the injected Puppeteer dependency.
    await writeFile(generatedCrawlerPath, `${functionSource.trim()}\n`, 'utf8');

    console.log(`Generated crawler saved to ${generatedCrawlerPath}:\n\n${functionSource}`);
    const crawlResult = await crawlReviews({ url: sourceUrl, puppeteer });
    const reviews = normalizeReviewRecords(
        Array.isArray(crawlResult) ? crawlResult : crawlResult.reviews,
        sourceUrl
    );
    const crawlMetadata = Array.isArray(crawlResult) ? null : crawlResult.metadata ?? null;

    // Step 5: Save the collected reviews and crawl details beside the generated crawler.
    await writeFile(generatedReviewsPath, JSON.stringify({
        source: sourceUrl,
        collectedAt: new Date().toISOString(),
        count: reviews.length,
        metadata: crawlMetadata,
        reviews
    }, null, 2) + '\n', 'utf8');

    console.log(`Saved reviews to ${generatedReviewsPath}`);
    console.log(`Collected ${reviews.length} reviews.`);
}

query(`Aggregate reviews from the webpage and also peform pagination to crawl reviews of the next page.`);