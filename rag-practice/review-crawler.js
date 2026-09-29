import { z } from 'zod';

export const GeneratedReviewCrawlerSchema = z.object({
    functionSource: z.string()
        .min(1)
        .max(30_000)
        .refine((source) => /^\s*async function crawlReviews\s*\(/.test(source), {
            message: 'Expected an async function named crawlReviews'
        })
        .refine((source) => /\/\/ Step 1:/.test(source) && /\/\/ Step 2:/.test(source), {
            message: 'Generated function must include numbered step comments'
        })
});

export const ReviewRecordSchema = z.object({
    review_comment: z.string().nullable(),
    review_date: z.string().nullable(),
    reviewer_name: z.string().nullable(),
    review_response: z.string().nullable(),
    review_ratings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    reviewId: z.string().nullable(),
    reviewUrl: z.string().url().nullable()
});

export function compileReviewCrawler(source) {
    // Step 1: Validate the generated source and its required function comments.
    const { functionSource } = GeneratedReviewCrawlerSchema.parse({ functionSource: source });

    // Step 2: Compile the validated function source and confirm it is asynchronous.
    const crawler = new Function(
        `${functionSource}\n//# sourceURL=rag-practice/generated-review-crawler.js\nreturn crawlReviews;`
    )();

    if (typeof crawler !== 'function' || crawler.constructor.name !== 'AsyncFunction') {
        throw new TypeError('Generated crawlReviews must be an async function');
    }

    return crawler;
}

export function normalizeReviewRecords(records, sourceUrl) {
    // Step 1: Reject crawler output that is not an array of review objects.
    if (!Array.isArray(records)) {
        throw new TypeError('Generated crawler must return an array of reviews');
    }

    // Step 2: Map crawler-specific field names and resolve review links against the source URL.
    return records.map((review) => {
        const rawReviewUrl = review.reviewUrl ?? review.review_url ?? null;
        let reviewUrl = null;
        if (rawReviewUrl) {
            try {
                reviewUrl = new URL(rawReviewUrl, sourceUrl).href;
            } catch (_) {
                reviewUrl = null;
            }
        }

        return ReviewRecordSchema.parse({
            review_comment: review.review_comment ?? review.text ?? review.comment ?? null,
            review_date: review.review_date ?? review.date ?? null,
            reviewer_name: review.reviewer_name ?? review.author ?? review.reviewer ?? null,
            review_response: review.review_response ?? review.response ?? null,
            review_ratings: review.review_ratings ?? review.ratings ??
                (review.rating == null ? {} : { overall_rating: review.rating }),
            reviewId: review.reviewId == null ? null : String(review.reviewId),
            reviewUrl
        });
    });
}