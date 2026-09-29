async function crawlReviews({ url, puppeteer }) {
  // Step 1: Initialize the browser, result collections, and pagination safeguards.
  let browser = null;
  const reviewsById = new Map();
  const visitedUrls = new Set();
  const visitedPageSignatures = new Set();
  const metadata = {
    sourceUrl: url,
    overallRatings: {},
    reviewCount: null,
    sourceVerifiedReviewCount: null,
    pagesCrawled: 0,
  };

  try {
    // Step 2: Launch Puppeteer and create a page for the review listing.
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Step 3: Define a small navigation helper that tolerates sites with ongoing network activity.
    const navigate = async (targetUrl) => {
      try {
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 });
      } catch (_) {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      }
      await page.waitForSelector('body', { timeout: 15000 }).catch(() => {});
    };

    // Step 4: Open the requested reviews page and allow its client-rendered content to settle.
    await navigate(url);
    await new Promise((resolve) => setTimeout(resolve, 700));

    // Step 5: Define the page extractor for company metadata, review cards, and pagination controls.
    const extractPage = async () => page.evaluate(() => {
      // Step 5a: Normalize visible text and safely parse numeric values from labels.
      const textOf = (node) => (node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim();
      const parseNumber = (value) => {
        if (value == null) return null;
        const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : null;
      };
      const absoluteUrl = (href) => {
        if (!href) return null;
        try { return new URL(href, location.href).href; } catch (_) { return null; }
      };

      // Step 5b: Read source-level merchant ratings and review counts from visible page text.
      const pageText = textOf(document.body);
      const overallRatings = {};
      const merchantHeader = document.querySelector('header p');
      const merchantText = textOf(merchantHeader);
      const ratingMatch = merchantText.match(/holds\s+a\s*([\d.]+)\s*\/\s*10\s*overall\s+rating/i);
      if (ratingMatch) overallRatings.overall = Number(ratingMatch[1]);
      const verifiedCountMatch = merchantText.match(/and\s+([\d,]+)\s+verified\s+post-delivery\s+reviews/i);
      const showingMatch = pageText.match(/Showing\s+[\d,]+\s*-\s*[\d,]+\s+of\s+([\d,]+)/i);
      const sourceVerifiedReviewCount = verifiedCountMatch ? Number(verifiedCountMatch[1].replace(/,/g, '')) : null;
      const reviewCount = showingMatch ? Number(showingMatch[1].replace(/,/g, '')) : sourceVerifiedReviewCount;

      // Step 5c: Locate review cards using review-specific permalink links, with list-item fallbacks.
      const cardSet = new Set();
      document.querySelectorAll('a[href*="reviewid="]').forEach((link) => {
        const card = link.closest('li');
        if (card) cardSet.add(card);
      });
      if (!cardSet.size) {
        document.querySelectorAll('li').forEach((item) => {
          const itemText = textOf(item);
          if (/Overall Rating\s*:/i.test(itemText) && item.querySelector('p')) cardSet.add(item);
        });
      }

      // Step 5d: Extract each review's own fields from its containing card, preserving their mapping.
      const reviews = Array.from(cardSet).map((card) => {
        const cardText = textOf(card);
        const permalink = Array.from(card.querySelectorAll('a[href]'))
          .map((link) => link.getAttribute('href'))
          .find((href) => href && /reviewid=/i.test(href));
        const reviewUrl = absoluteUrl(permalink);
        let reviewId = card.getAttribute('data-review-id') || card.id || null;
        if (reviewUrl) {
          try { reviewId = new URL(reviewUrl).searchParams.get('reviewid') || reviewId; } catch (_) {}
        }
        if (reviewId) reviewId = String(reviewId).replace(/^review-/, '');

        const paragraphs = Array.from(card.querySelectorAll('p'));
        const dateNode = card.querySelector('p.italic, time[datetime], time');
        const reviewerNode = card.querySelector('p.font-bold, .font-bold');
        const reviewerName = reviewerNode ? textOf(reviewerNode) : null;
        const reviewDate = dateNode
          ? (dateNode.getAttribute('datetime') || textOf(dateNode))
          : null;

        // Step 5e: Use paragraph and response-like elements to identify review text and any merchant reply.
        const categoryText = Array.from(card.querySelectorAll('span')).map(textOf);
        const excluded = new Set([reviewerName, reviewDate, ...categoryText].filter(Boolean));
        const commentCandidates = paragraphs
          .map(textOf)
          .filter((value) => value && !excluded.has(value) && !/^Overall Rating\s*:/i.test(value)
            && !/^(Would Shop Here Again|Likelihood To Recommend)\s*:/i.test(value));
        const responseNode = card.querySelector('[class*="response"], [data-testid*="response"], .review-response');
        let reviewResponse = responseNode ? textOf(responseNode) : null;
        let reviewComment = commentCandidates.length ? commentCandidates[commentCandidates.length - 1] : null;
        if (responseNode && reviewComment === textOf(responseNode)) reviewComment = null;
        if (reviewResponse && /^(response|merchant response)\s*:?\s*/i.test(reviewResponse)) {
          reviewResponse = reviewResponse.replace(/^(response|merchant response)\s*:?\s*/i, '').trim() || null;
        }

        // Step 5f: Collect labeled ratings from the review card without mixing them with other reviews.
        const reviewRatings = {};
        card.querySelectorAll('li').forEach((ratingItem) => {
          const label = textOf(ratingItem);
          const match = label.match(/^([^:]+):\s*(-?\d+(?:\.\d+)?)/);
          if (match) reviewRatings[match[1].trim()] = Number(match[2]);
        });
        if (!Object.keys(reviewRatings).length) {
          const overallMatch = cardText.match(/Overall Rating\s*:\s*(-?\d+(?:\.\d+)?)/i);
          if (overallMatch) reviewRatings.overall = Number(overallMatch[1]);
        }

        return {
          review_comment: reviewComment,
          review_date: reviewDate,
          reviewer_name: reviewerName,
          review_response: reviewResponse,
          review_ratings: reviewRatings,
          reviewId: reviewId || null,
          reviewUrl: reviewUrl || null,
        };
      }).filter((review) => review.review_comment || review.reviewId || review.reviewer_name);

      // Step 5g: Find a genuine next-page control; review permalinks are deliberately excluded.
      const nextCandidates = Array.from(document.querySelectorAll('a[href], button'));
      const nextControl = nextCandidates.find((element) => {
        const label = `${textOf(element)} ${element.getAttribute('aria-label') || ''} ${element.getAttribute('rel') || ''}`;
        const href = element.getAttribute('href') || '';
        return !/reviewid=/i.test(href)
          && (/\bnext\b|next page|older reviews|›|»/i.test(label)
            || /(^|\s)next(\s|$)/i.test(element.getAttribute('rel') || ''))
          && !element.disabled
          && element.getAttribute('aria-disabled') !== 'true';
      });
      const nextHref = nextControl?.tagName === 'A' ? absoluteUrl(nextControl.getAttribute('href')) : null;

      // Step 5h: Return the extracted data and a selector hint for button-based pagination.
      return {
        overallRatings,
        reviewCount,
        sourceVerifiedReviewCount,
        reviews,
        nextHref,
        hasNextButton: !!nextControl && nextControl.tagName !== 'A',
        nextButtonLabel: nextControl ? textOf(nextControl) : null,
      };
    });

    // Step 6: Crawl no more than ten distinct listing pages and stop when pagination is exhausted.
    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      // Step 6a: Record the current URL and avoid navigating to any URL already crawled.
      const currentUrl = page.url();
      if (visitedUrls.has(currentUrl)) break;
      visitedUrls.add(currentUrl);

      // Step 6b: Extract the current listing page and update source-level metadata when available.
      const data = await extractPage();
      metadata.pagesCrawled += 1;
      if (data.overallRatings && Object.keys(data.overallRatings).length) {
        metadata.overallRatings = { ...metadata.overallRatings, ...data.overallRatings };
      }
      if (metadata.reviewCount == null && data.reviewCount != null) metadata.reviewCount = data.reviewCount;
      if (metadata.sourceVerifiedReviewCount == null && data.sourceVerifiedReviewCount != null) {
        metadata.sourceVerifiedReviewCount = data.sourceVerifiedReviewCount;
      }

      // Step 6c: Add extracted reviews by their stable ID or permalink, merging only missing fields.
      for (const review of data.reviews) {
        const key = review.reviewId || review.reviewUrl || `${review.reviewer_name || ''}|${review.review_date || ''}|${review.review_comment || ''}`;
        const existing = reviewsById.get(key);
        if (!existing) {
          reviewsById.set(key, review);
        } else {
          for (const field of ['review_comment', 'review_date', 'reviewer_name', 'review_response', 'reviewUrl', 'reviewId']) {
            if (existing[field] == null && review[field] != null) existing[field] = review[field];
          }
          if (!Object.keys(existing.review_ratings || {}).length && Object.keys(review.review_ratings || {}).length) {
            existing.review_ratings = review.review_ratings;
          }
        }
      }

      // Step 6d: Stop if there is no usable next control or the next listing URL has already been visited.
      if (!data.nextHref && !data.hasNextButton) break;
      if (data.nextHref && visitedUrls.has(data.nextHref)) break;

      // Step 6e: Follow a unique next-page link, or click a button control and verify that content changed.
      if (data.nextHref) {
        await navigate(data.nextHref);
      } else {
        const priorSignature = data.reviews.map((review) => review.reviewId || review.reviewUrl || review.review_comment).join('|');
        if (visitedPageSignatures.has(priorSignature)) break;
        visitedPageSignatures.add(priorSignature);
        const clicked = await page.evaluate((label) => {
          const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
          const controls = Array.from(document.querySelectorAll('button, a[role="button"]'));
          const control = controls.find((element) => normalize(element.innerText) === normalize(label));
          if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return false;
          control.click();
          return true;
        }, data.nextButtonLabel);
        if (!clicked) break;
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 600));
        const after = await extractPage();
        const afterSignature = after.reviews.map((review) => review.reviewId || review.reviewUrl || review.review_comment).join('|');
        if (!afterSignature || afterSignature === priorSignature || visitedPageSignatures.has(afterSignature)) break;
        visitedPageSignatures.add(afterSignature);
      }

      // Step 6f: Allow client-rendered pagination results to appear before the next extraction.
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    // Step 7: Return metadata and all unique reviews in the required review-object format.
    return {
      metadata: {
        ...metadata,
        sourceUrl: url,
        reviewCount: metadata.reviewCount ?? reviewsById.size,
      },
      reviews: Array.from(reviewsById.values()).map((review) => ({
        review_comment: review.review_comment ?? null,
        review_date: review.review_date ?? null,
        reviewer_name: review.reviewer_name ?? null,
        review_response: review.review_response ?? null,
        review_ratings: review.review_ratings && Object.keys(review.review_ratings).length ? review.review_ratings : {},
        reviewId: review.reviewId ?? null,
        reviewUrl: review.reviewUrl ?? null,
      })),
    };
  } finally {
    // Step 8: Always close the browser, including when navigation or extraction fails.
    if (browser) await browser.close().catch(() => {});
  }
}
