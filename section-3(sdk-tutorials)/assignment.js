import 'dotenv/config';
import OpenAI from "openai";
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const ConsensusResponse = z.object({
    selectedModel: z.enum(["Claude", "ChatGPT", "Gemini"]),
    answer: z.string(),
    reason: z.string()
});

async function askClaude(question) {
    const client = new Anthropic();

    const message = await client.messages.create({
        max_tokens: 3072,
        messages: [{ role: "user", content: question }],
        model: "claude-opus-5-5"
    }, {
        headers: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID }
    });

    let completeResponse = ``;

    for (const block of message.content) {
        if (block.type === "text") {
            // console.log(block.text);
            completeResponse = completeResponse.concat(block.text);
        }
    }

    return completeResponse;
}

async function askChatGpt(question) {
    const client = new OpenAI();

    const response = await client.responses.create({
        model: "gpt-6-luna",
        input: question
    });

    // console.log(response.output_text);

    return response.output_text;

}

async function askGemini(question) {
    const ai = new GoogleGenAI({});

    const interaction = await ai.interactions.create({
        model: "gemini-3.8-flash",
        input: question,
    });
    return interaction.output_text;
}

async function performSelfConsistency(question) {
    // Step 1: Ask the questions to each of the GPTs
    const [claudeResponse, chatGptResponse, geminiResponse] = await Promise.all([
        askClaude(question),
        askChatGpt(question),
        askGemini(question)
    ]);

    // Step 2: Ask which of these have 2 similar response and make that final response
    const finalResponse = await askClaude(`
        Question: ${question},
        Claude's Response: ${claudeResponse},
        ChatGpt's response: ${chatGptResponse},
        Gemini's response: ${geminiResponse}
        Instruction: Check which of these GPTs give similar answers. If any 2 GPTs agree, select that answer.
        Respond with valid JSON only with following response format:
        {"selectedModel":"Claude|ChatGPT|Gemini","answer":"the selected answer","reason":"why these responses agree"}`);

    const jsonResponse = finalResponse.replace(/^```json\s*|\s*```$/g, "").trim();
    return finalResponse;

}

console.log(await performSelfConsistency(`How much has memory development in AI's succeeded and what is the issue? I found at a lecture, its still not matured`));