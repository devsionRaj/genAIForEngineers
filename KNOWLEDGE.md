# Generated Crawler Functions

- Every function we write, including helpers and generated functions, must use numbered step comments for its major logical stages. Start at `// Step 1: ...`, number steps sequentially, and place each concise comment immediately before the code it summarizes. Do not limit this convention to LLM-generated functions.
- When asking an LLM to generate a function, explicitly require the same numbered step-comment convention in the function body.
- State all dependencies and the function's input/output contract explicitly in the LLM prompt. For the review crawler, inject Puppeteer as a function argument; generated source must not import dependencies itself.
- Avoid `page.waitForTimeout()` in Puppeteer code; it may be unavailable in the installed version and throw `TypeError: page.waitForTimeout is not a function`. When an explicit delay is necessary, use `await new Promise((resolve) => setTimeout(resolve, milliseconds))` instead.
- Validate structured LLM output with Zod, syntax-check generated source before saving or execution, and save reusable generated code under `rag-practice/`.
- The review crawler source is saved to `rag-practice/generated-review-crawler.js`; execute it later with `node rag-practice/run-generated-review-crawler.js <url>`.
- `new Function()` executes arbitrary JavaScript and is not a security sandbox. Review generated source before running it, especially if prompts or retrieved page content are untrusted.
