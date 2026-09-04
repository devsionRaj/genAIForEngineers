import { exec } from 'child_process';
import { mkdir, readFile, writeFile } from 'fs/promises';

import OpenAI from 'openai';
import 'dotenv/config';
import axios from 'axios';

const client = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
});

async function getWeatherData(city) {
    let config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `https://wttr.in/${city}?format=4`,
        responseType: 'text',
        headers: {}
    };

    try {
        const result = await axios.request(config);
        return result.data;
    } catch (error) {
        return error;
    }
}

async function executeCommandOnCLI(cmd) {
    return new Promise((res, rej) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                rej(stderr);
                return;
            }
            res(cmd);
            // console.log(`stdout: ${stdout}`);
            // console.error(`stderr: ${stderr}`);
        })
    });
}

const SYSTEM_PROMPT = `
You are an excellent web scrapping developer.
Whenever a problem is presented to you, you try to break it down and solve a smaller problem. Once that smaller problem is solved, then you look back and see other subproblems. Once all the subproblems are solved, then you return response to the user.

We are going to follow the following pipeline: "INITIAL" | "ANALYSE" | "THINK" | "TOOLS_REQUEST" | "OUTPUT"

The pipeline:
- "INITIAL": When user gives an initial prompt, try to understand what the user is trying to do
- "THINK": this is where we look at the problem and think how to solve it and start breaking down the problem
- "ANALYSE": this is where we analyse the solution and also verify if the output is correct
- "THINK": we can go back to the think mode and see if the subproblem remains and think
- "ANALYSE": again analyse the problem and get into a solution
- "TOOLS_REQUEST": this is where we will access tools as per our requirement to solve an use case. The format of output would be: 
{ step: "TOOLS_REQUEST", functionName: "getWeatherData", input: "Ranchi", inputCaption: "A brief data to inform about the input"}
- "OUTPUT": When you receive a final result, we need to show the response here

Available tools:
- getWeatherData: It is used to fetch live realtime weather of a city
- executeCommandOnCLI: It is used to perform any cli command execution on the system

Rules:
  - Always output one step at a time and wait for other step before proceeding.
  - You should use all the pipelines as per need.
  - Always maintain the sequence of pipeline as given in example
  - Always follow JSON output format strictly.
  - Always try to pick tools from the available list only. otherwise tell it in the hint if its different. It will fail automatically

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

Example:
- USER: "What is weather of Ranchi?"
OUTPUT:
- "INITIAL": User wants to get weather of Ranchi
- "THINK": From the tools available to me, I can see "getWeatherData" tool can be used to fetch real time weather data
- "TOOLS_REQUEST": Call the tool "getWeatherData" with input of cityName
- "TOOL_OUTPUT": The tool returned "Weather is Ranchi: 26degrees with mild shower"
- "THINK": The tool has responded with the weather details of Ranchi. So let me pick the temperature and weather condition from it
- "ANALYSE": The temperature is 26 degrees and weather condition is mild shower
- "OUTPUT": Weather: 26 degrees, mild shower

OUTPUT_FORMAT"
{step: "INITIAL" | "ANALYSE" | "TOOLS_REQUEST" | "TOOLS_OUTPUT" | "THINK" | "OUTPUT", text: <The actual text>}
`;

const STATE_DIRECTORY_URL = new URL('./state/', import.meta.url);

function createStateName() {
    return `State_${new Date().toISOString().replace(/[:.]/g, '-')}_${process.pid}.json`;
}

function getStateFilePath(stateName) {
    return new URL(`./${stateName}`, STATE_DIRECTORY_URL);
}

async function readState(stateFilePath) {
    await mkdir(STATE_DIRECTORY_URL, { recursive: true });
    const stateFile = await readFile(stateFilePath, 'utf8');
    const state = JSON.parse(stateFile);

    if (!Array.isArray(state.messages)) {
        throw new Error('State file must contain a messages array');
    }

    return state;
}

async function writeState(stateFilePath, state) {
    await mkdir(STATE_DIRECTORY_URL, { recursive: true });
    await writeFile(stateFilePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function appendMessage(stateFilePath, state, message) {
    state.messages.push(message);
    await writeState(stateFilePath, state);
}

async function main(prompt) {
    const stateName = createStateName();
    const stateFilePath = getStateFilePath(stateName);
    await writeState(stateFilePath, { name: stateName, messages: [] });
    const state = await readState(stateFilePath);

    await appendMessage(stateFilePath, state, { role: 'system', content: SYSTEM_PROMPT });

    const USER_PROMPT = { role: 'user', content: prompt };
    await appendMessage(stateFilePath, state, USER_PROMPT);

    while (true) {
        const result = await client.chat.completions.create({
            model: 'gpt-5.6-sol',
            messages: state.messages,
        });

        const rawResult = result.choices[0].message.content;
        const parsedResult = JSON.parse(rawResult);

        if (parsedResult.step === "TOOLS_REQUEST") {
            console.log(`(${parsedResult.step}): FunctionName-> ${parsedResult.functionName}, InputDetail: ${parsedResult.inputCaption}`);
            switch (parsedResult.functionName) {
                case "getWeatherData":
                    const weatherData = await getWeatherData(parsedResult.input);
                    await appendMessage(stateFilePath, state, { role: 'developer', content: weatherData });
                    break;
                case 'executeCommandOnCLI':
                    let toolResult;
                    try {
                        toolResult = await executeCommandOnCLI(parsedResult.input);
                        await appendMessage(stateFilePath, state, { role: 'developer', content: JSON.stringify({ step: 'TOOL_OUTPUT', output: toolResult }) });
                    } catch (err) {
                        await appendMessage(stateFilePath, state, { role: 'developer', content: JSON.stringify({ status: 'error', err }) });
                    }
                    break;
                default:
                    console.log(JSON.stringify(parsedResult));
                    await appendMessage(stateFilePath, state, {
                        role: 'developer', content: JSON.stringify({
                            status: 'error',
                            reason: 'No such tool exists. This is most probably your response object is faulty.',
                            responseObject: rawResult
                        })
                    });
                    console.log(`No such tool exists`);
            }
        } else {
            await appendMessage(stateFilePath, state, { role: 'assistant', content: rawResult });
            console.log(`(${parsedResult.step}): ${parsedResult.text}`);
        }

        if (parsedResult.step.toLowerCase() === 'output') {
            break;
        }
    }
}

main(`
    1. Can you please create a web app to maintain day to day finance for a normal indian family? Lets name the app as "KhataGhar".
    2. Save all the project files in "chatGptBuiltProjects/finance-manager" folder.Keep the frontend and backend folder separate to maintain difference b/w the 2 aspects. Use the tech stack mentioned in step 6, and keep everything clean.
    3. Code structure should be plain. First comment and then respective code.
    3a. Let the code structure be functional javascript.
    3b. Each function should use the following structure:-
        function <name-of-function>{
            // Step 1: Mention the initial step what the following code before the next comment is going to do
            <--------------CODE---------------->
            // Step 2: Next segment of code's work
            <--------------CODE---------------->
        }
    3c. Steps can be as granular as possible. You can go to step 2a,2aa, etc. Means as granular as possible.
    4. In the app, I will enter all the details, you can keep a data pre-filling button which will load data from a sample json file which you can keep locally. This will help get a feel of how the application will look when the user fills all the details properly. Also keep a data reset button, using which I can reset the pre-filled data. This button will be active initially when the user has not entered anything.
    5. The code files should be structured and can be nested to give a proper useful meaning to a developer and then finally open the app. Use as many files as possible to divide all the sections properly. The app should be properly functional and developer frindly. I have instructed you the steps keeping before any code segment. Use this globally across the code. You should keep a comment before every function defining its signature(input, output and its granular data type), a statment for its functionality. Make sure the funtion does all the things mentioned. 
    6. Keep all the requirements for nodejs as well as its an independent project. Use the following tech stack for the project:
        Env: Node.js for backend and simple html, css and vanilla js for frontend.
        Language: TypeScript, HTML, JSON
        Nodemon: Needed for developer friendly env
        Linting: Yes and latest
        Logging: Use winston for now and make it such that we can move to kibana, coralogix with a simple config change
        Database: MongoDB`);
