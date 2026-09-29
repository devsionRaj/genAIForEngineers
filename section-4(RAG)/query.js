import 'dotenv/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';
import OpenAI from 'openai';

const client = new OpenAI();

async function query(userQuery) {
    // Convert user query to vector embeddings
    // Initialize the embedding model
    const embeddings = new OpenAIEmbeddings({
        model: 'text-embedding-3-small',
        apiKey: process.env.OPENAI_API_KEY
    });

    // Search the vectors in the qdrant
    const vectorStore = await QdrantVectorStore.fromExistingCollection(
        embeddings,
        {
            url: 'http://localhost:6333',
            collectionName: 'chaicode-docs'
        }
    );

    // Get similar vector and chunks
    const vectorRetriver = vectorStore.asRetriever({ k: 5 }); // Bring at max 5 chunks as per the user query
    const results = await vectorRetriver.invoke(userQuery);


    // Feed those chunks to llm model and do a simple chat with {userQuery}
    const SYSTEM_PROMPT = `
        You are an expert in answering user query based on the provided context about document.
        Do not answer anything beyond, what is not provided.

        Always answer the user in short and also tell on which page number the content is available.

        User Documents:
        ${results.map(e => JSON.stringify({ pageContent: e.pageContent, pageNumber: e.metadata.loc.pageNumber })).join('\n\n')}
    `;

    console.log(SYSTEM_PROMPT);

    const llmResponse = await client.chat.completions.create({
        model: 'gpt-6-luna',
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userQuery }
        ]
    });

    console.log(`LLM Response: `, llmResponse.choices[0].message.content);
}

query(`What is Selection sort?`);