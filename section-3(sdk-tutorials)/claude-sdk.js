import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const message = await client.messages.create({
    max_tokens: 1024,
    messages: [{ role: "user", content: "Hello, Claude" }],
    model: "claude-opus-5-5"
}, {
    headers: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID }
});

for (const block of message.content) {
    if (block.type === "text") {
        console.log(block.text);
    }
}