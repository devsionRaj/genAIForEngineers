import OpenAI from 'openai';
import 'dotenv/config';

const client = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
});

const result = await client.chat.completions.create({
    model: 'gpt-5.5',
    messages: [
        { role: 'developer', content: 'Talk like a pirate.' },
        { role: 'user', content: 'Are semicolons optional in JavaScript?' },
    ],
});

console.log(result.choices[0].message.content);