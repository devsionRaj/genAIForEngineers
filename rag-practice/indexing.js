import 'dotenv/config';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import puppeteer from 'puppeteer';
import { Document } from '@langchain/core/documents';
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';
import { chunkHtml } from './html-chunker.js';

async function generateVectorEmbeddingsForFile(filepath) {
    // Step 1: Load the PDF content as document
    const loader = new PDFLoader(filepath);
    const document = await loader.load();

    // Step 2: Initialize the embedding model
    const embeddings = new OpenAIEmbeddings({
        model: 'text-embedding-3-small'
    });

    // Step 3: Create the vector store to read vector data from qdrant vectorDB
    const vectorStore = await QdrantVectorStore.fromExistingCollection(
        embeddings,
        {
            url: 'http://localhost:6333',
            collectionName: 'rag-practice'
        }
    );

    // Step 4: Create indexing in the VectorDB
    await vectorStore.addDocuments(document);
    console.log(`All the embeddings are indexed!`);
}

async function embeddingForWebPage(url) {
    // Step 1: Open the page after its network activity settles and capture its rendered HTML.
    const browser = await puppeteer.launch({ headless: true });

    try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });

        const pageData = {
            title: await page.title(),
            source: page.url(),
            html: await page.content()
        };

        if (!pageData.html.trim()) {
            throw new Error(`No HTML content found at ${url}`);
        }

        // Step 2: Split the HTML and attach the page metadata to each chunk.
        const chunks = chunkHtml(pageData.html, {
            chunkSize: 10000,
            chunkOverlap: 1500
        }).map((chunk) => new Document({
            pageContent: chunk.pageContent,
            metadata: {
                source: pageData.source,
                title: pageData.title,
                parentTagPath: chunk.parentTagPath
            }
        }));

        // Step 3: Add the chunks to the existing Qdrant collection.
        const embeddings = new OpenAIEmbeddings({
            model: 'text-embedding-3-small'
        });
        const vectorStore = await QdrantVectorStore.fromExistingCollection(
            embeddings,
            {
                url: 'http://localhost:6333',
                collectionName: 'rag-practice'
            }
        );

        await vectorStore.addDocuments(chunks);
        console.log(`Indexed ${chunks.length} chunks from ${pageData.source}`);
    } finally {
        await browser.close();
    }
}

const webpageUrl = process.argv[2];

if (!webpageUrl) {
    throw new Error('Pass a webpage URL: node rag-practice/indexing.js <url>');
}

embeddingForWebPage(webpageUrl).catch((error) => {
    console.error('Webpage indexing failed:', error);
    process.exitCode = 1;
});