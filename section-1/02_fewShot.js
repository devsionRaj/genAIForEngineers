import OpenAI from 'openai';
import 'dotenv/config';

const client = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
});

const result = await client.chat.completions.create({
    model: 'gpt-5.6-luna',
    messages: [
        {
            role: 'user',
            content: `
            What is 2 / 2?
            
            Examples:
            Question: What is 5 + 4?
            Answer: 9 (Nine)
            Question: What is 6 * 9?
            Answer: 54 (Fifty four)
            ` },
    ],
});

console.log(`Answer from OpenAI: ${result.choices[0].message.content}`);