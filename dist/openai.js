"use strict";
/**
* @license Apache-2.0
*
* Copyright (c) 2023 The Stdlib Authors.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*    http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAnswer = exports.findMostSimilar = exports.createEmbedding = exports.assemblePrompt = exports.setupOpenAI = void 0;
// MODULES //
const openai_1 = require("openai");
// VARIABLES //
let config;
let openai;
const PROMPT_TEMPLATE = `I am a highly intelligent question answering bot for programming questions in JavaScript. If you ask me a question that is rooted in truth, I will give you the answer. If you ask me a question that is nonsense, trickery, is not related to the stdlib-js / @stdlib project for JavaScript and Node.js, or has no clear answer, I will respond with "Unknown.". If the requested functionality is not available or cannot be implemented using stdlib, I will respond with "Not yet implemented.". I will include example code if relevant to the question, formatted as GitHub Flavored Markdown code blocks. After the answer, I will provide a list of Markdown links to the relevant documentation on GitHub under a ## References heading followed by a list of Markdown link definitions for all the links in the answer.

I will answer below question by referencing the following packages from the project:
{{files}}

{{history}}
Question: {{question}}
Answer:`;
// FUNCTIONS //
/**
* Sets up the OpenAI API.
*
* @private
* @param apiKey - OpenAI API key
*/
function setupOpenAI(apiKey) {
    config = new openai_1.Configuration({
        'apiKey': apiKey
    });
    openai = new openai_1.OpenAIApi(config);
}
exports.setupOpenAI = setupOpenAI;
/**
* Compresses text content for use in a prompt.
*
* @private
* @param text - text content
* @param removeCodeBlocks - boolean indicating whether to remove code blocks
* @returns compressed content
*/
function compressContent(text, removeCodeBlocks = true) {
    // Remove the license header:
    text = text.replace(/\/\*\*\n \* @license[\s\S]*?\n \*\/\n/gm, '');
    // Replace Windows line endings with Unix line endings:
    text = text.replace(/\r\n/g, '\n');
    // Only keep usage sections (surrounded by <section class="usage">...</section>):
    text = text.replace(/([\s\S]*?)<section class="usage">([\s\S]*?)<\/section>([\s\S]*)/g, '$2');
    // Remove all code blocks if requested:
    if (removeCodeBlocks) {
        text = text.replace(/```[\s\S]*?```/g, '');
    }
    // Remove all link definitions:
    text = text.replace(/\[.*?\]:[\s\S]*?\n/g, '');
    // Remove any HTML comments:
    text = text.replace(/<!--([\s\S]*?)-->/g, '');
    // Remove any closing </section> tags:
    text = text.replace(/<\/section>/g, '');
    // Remove any opening <section class=""> tags:
    text = text.replace(/<section class="[^"]+">/g, '');
    // Replace multiple newlines with a single newline:
    text = text.replace(/\n{3,}/g, '\n\n');
    // Remove any leading or trailing newlines:
    text = text.replace(/^\n+|\n+$/g, '');
    // Replace all newlines with a space:
    text = text.replace(/\n/g, ' ');
    // Replace all multiple spaces with a single space:
    text = text.replace(/ {2,}/g, ' ');
    // Replace all multiple tabs with a single tab:
    text = text.replace(/\t{2,}/g, '\t');
    return text;
}
/**
* Assembles a prompt for the OpenAI API.
*
* @private
* @param question - question to answer
* @param mostSimilar - most relevant files to the question
* @param history - previous conversation history with the bot
* @returns assembled prompt
*/
function assemblePrompt(question, mostSimilar, history) {
    history = compressContent(history, false);
    return PROMPT_TEMPLATE
        .replace('{{files}}', mostSimilar.map(x => {
        return `Package: ${x.package}\nText: ${compressContent(x.content)}`;
    }).join('\n\n'))
        .replace('{{history}}', history ? `History:\n${history}\n` : '')
        .replace('{{question}}', question);
}
exports.assemblePrompt = assemblePrompt;
/**
* Generates an embedding for a given question.
*
* @private
* @param question - question
* @returns promise resolving to the embedding vector
*/
async function createEmbedding(question) {
    const result = await openai.createEmbedding({
        'input': question,
        'model': 'text-embedding-ada-002'
    });
    return result.data.data[0].embedding;
}
exports.createEmbedding = createEmbedding;
/**
* Finds the most N similar embeddings to a given embedding provided the similarity is greater than a given threshold.
*
* @private
* @param embedding - question embedding
* @param allEmbeddings - all embeddings
* @param topN - number of most similar embeddings to return
* @param threshold - similarity threshold
* @returns most similar embeddings
*/
async function findMostSimilar(embedding, allEmbeddings, topN = 3, threshold = 0.6) {
    const similarities = new Array(allEmbeddings.length);
    for (let i = 0; i < allEmbeddings.length; i++) {
        const similarity = vectorSimilarity(embedding, allEmbeddings[i].embedding);
        similarities[i] = {
            'embedding': allEmbeddings[i],
            'similarity': similarity
        };
    }
    // Sort similarities in descending order:
    similarities.sort((a, b) => b.similarity - a.similarity);
    // Only keep the top N embeddings that have a similarity greater than the threshold:
    return similarities
        .filter(x => x.similarity > threshold)
        .slice(0, topN)
        .map(x => x.embedding);
}
exports.findMostSimilar = findMostSimilar;
/**
* Computes the cosine similarity between two embedding vectors.
*
* ## Notes
*
* -   Since OpenAI embeddings are normalized, the dot product is equivalent to the cosine similarity.
*
* @private
* @param x - first vector
* @param y - second vector
* @returns dot product
*/
function vectorSimilarity(x, y) {
    let sum = 0;
    for (let i = 0; i < x.length; i++) {
        sum += x[i] * y[i];
    }
    return sum;
}
/**
* Appends a disclaimer to a string containing an answer outlining that the answer was generated with the help of AI and how to ask follow-up questions.
*
* @private
* @param str - string to which to append disclaimer
* @returns string with disclaimer appended
*/
function appendDisclaimer(str) {
    return str + '\n\n### Disclaimer\n\n-   This answer was generated with the help of AI and is not guaranteed to be correct. We will review the answer and update it if necessary.\n-   You can also ask follow-up questions to clarify the answer or request additional information by leaving a comment on this issue starting with `/ask`.';
}
/**
* Generates an answer to a given prompt.
*
* @private
* @param prompt - prompt
* @returns promise resolving to the answer
*/
async function generateAnswer(prompt) {
    const completionResult = await openai.createCompletion({
        'prompt': prompt,
        'max_tokens': 1500,
        'temperature': 0.5,
        'top_p': 1,
        'model': 'text-davinci-003'
    });
    let out = completionResult.data.choices[0].text;
    out = appendDisclaimer(out);
    return out;
}
exports.generateAnswer = generateAnswer;
//# sourceMappingURL=openai.js.map