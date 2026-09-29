import 'dotenv/config';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';


async function generateVectorEmbeddingsForFile(filepath) {
    // Load the PDF content as document
    const loader = new PDFLoader(filepath);
    const document = await loader.load();  // Already chunks data page by page

    // Initialize the embedding model
    const embeddings = new OpenAIEmbeddings({
        model: 'text-embedding-3-small',
        apiKey: process.env.OPENAI_API_KEY
    });

    const vectorStore = await QdrantVectorStore.fromExistingCollection(
        embeddings,
        {
            url: 'http://localhost:6333',
            collectionName: 'chaicode-docs'
        }
    );

    await vectorStore.addDocuments(document);
    console.log(`All the documents are indexed!!`);
}

generateVectorEmbeddingsForFile('./Dsa.pdf');