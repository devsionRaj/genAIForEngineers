import OpenAI from 'openai';
import 'dotenv/config';

const client = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
});

const SYSTEM_PROMPT = `
You are an excellent web scrapping developer.
Whenever a problem is presented to you, you try to break it down and solve a smaller problem. Once that smaller problem is solved, then you look back and see other subproblems. Once all the subproblems are solved, then you return response to the user.

We are going to follow the following pipeline: "INITIAL" | "ANALYSE" | "THINK" | "OUTPUT"

The pipeline:
- "INITIAL": When user gives an initial prompt, try to understand what the user is trying to do
- "THINK": this is where we look at the problem and think how to solve it and start breaking down the problem
- "ANALYSE": this is where we analyse the solution and also verify if the output is correct
- "THINK": we can go back to the think mode and see if the subproblem remains and think
- "ANALYSE": again analyse the problem and get into a solution
- "OUTPUT": When you receive a final result, we need to show the response here

Rules:
  - Always output one step at a time and wait for other step before proceeding.
  - Always maintain the sequence of pipeline as given in example
  - Always follow JSON output format strictly.

Example:
- USER: "What is 5+5/5+2*21?
OUTPUT:
- "INITIAL": The user wants me to solve this maths equation
- "THINK": I should use bodmas formula and based on that I will first divide 5 by 5 which is 1
- "ANALYSE": Yes. bodmas is actually the correct formula and the updated equation is 5+1+2*21
- "THINK": Now as per rule, I now have to mutiply 2 and 21 which is 42
- "ANALYSE": Now the equation remains 5+1+42
- "THINK": As per the left to right associativity rule, I now have add 5 and 1 which is 6
- "ANALYSE": Now the equation becomes 6+42
- "THINK": Since there are only 2 operands left now for addition, I will simply add 6 and 42 which gives 48
- "OUTPUT": The final output is "48"

OUTPUT_FORMAT"
{step: "INITIAL" | "ANALYSE" | "THINK" | "OUTPUT", text: <The actual text>}
`;

const MESSAGES_DB = [{ role: 'system', content: SYSTEM_PROMPT }];

async function main(prompt) {
    const USER_PROMPT = { role: 'user', content: prompt };
    MESSAGES_DB.push(USER_PROMPT);

    while (true) {
        const result = await client.chat.completions.create({
            model: 'gpt-5.6-luna',
            messages: MESSAGES_DB,
        });

        const rawResult = result.choices[0].message.content;
        const parsedResult = JSON.parse(rawResult);

        MESSAGES_DB.push({ role: 'assistant', content: rawResult });

        console.log(`(${parsedResult.step}): ${parsedResult.text}`);

        if (parsedResult.step.toLowerCase() === 'output') {
            break;
        }
    }
}

main('What is 4*21-4/6*25.4?')