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
// MODULES //
// MODULES //
const openai_1 = require("openai");
const core_1 = require("@actions/core");
const github_1 = require("@actions/github");
const graphql_1 = require("@octokit/graphql");
const rest_1 = require("@octokit/rest");
const promises_1 = require("fs/promises");
const path_1 = require("path");
// VARIABLES //
const OPENAI_API_KEY = (0, core_1.getInput)('OPENAI_API_KEY', {
    required: true
});
const GITHUB_TOKEN = (0, core_1.getInput)('GITHUB_TOKEN', {
    required: true
});
const question = (0, core_1.getInput)('question', {
    required: true
});
const graphqlWithAuth = graphql_1.graphql.defaults({
    headers: {
        authorization: `token ${GITHUB_TOKEN}`
    },
});
const octokit = new rest_1.Octokit({
    auth: GITHUB_TOKEN
});
const config = new openai_1.Configuration({
    'apiKey': OPENAI_API_KEY
});
const openai = new openai_1.OpenAIApi(config);
const PROMPT = `I am a highly intelligent question answering bot for programming questions in JavaScript. If you ask me a question that is rooted in truth, I will give you the answer. If you ask me a question that is nonsense, trickery, is not related to the stdlib-js / @stdlib project for JavaScript and Node.js, or has no clear answer, I will respond with "Unknown.". If the requested functionality is not available or cannot be implemented using stdlib, I will respond with "Not yet implemented.". I will include example code if relevant to the question, formatted as GitHub Flavored Markdown code blocks. After the answer, I will provide a list of Markdown links to the relevant documentation on GitHub under a ## References heading followed by a list of Markdown link definitions for all the links in the answer.

I will answer below question by referencing the following packages from the project:
{{files}}

{{history}}
Question: {{question}}
Answer:`;
// FUNCTIONS //
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
* Creates a comment on an issue.
*
* @private
* @param options - function options
* @param options.owner - repository owner
* @param options.repo - repository name
* @param options.issueNumber - issue number
* @param options.body - comment body
* @returns promise resolving to the response data
*/
async function createComment({ owner, repo, issueNumber, body }) {
    const response = await octokit.issues.createComment({
        'owner': owner,
        'repo': repo,
        'issue_number': issueNumber,
        'body': body
    });
    return response.data;
}
/**
* Adds a comment to a discussion.
*
* @private
* @param discussionId - discussion id
* @param body - comment body
* @returns promise resolving to the comment
*/
async function addDiscussionComment(discussionId, body) {
    const query = `
		mutation ($discussionId: ID!, $body: String!) {
		addDiscussionComment(input:{discussionId: $discussionId, body: $body}) {
			comment {
				id
				body
			}
		}
		}
	`;
    const variables = {
        discussionId,
        body
    };
    const result = await graphqlWithAuth(query, variables);
    (0, core_1.info)('Successfully added comment to discussion.');
    (0, core_1.info)(JSON.stringify(result));
    return result;
}
/**
* Returns the comments for a discussion.
*
* @private
* @param discussionId - discussion id
* @returns promise resolving to the comments
*/
async function getDiscussionComments(discussionId) {
    const query = `
		query ($discussionId: ID!) {
		node(id: $discussionId) {
			... on Discussion {
			comments(first: 100) {
				nodes {
				author {
					login
				}
				body
				}
			}
			}
		}
		}
	`;
    const variables = {
        discussionId
    };
    const result = await graphqlWithAuth(query, variables);
    (0, core_1.info)('Successfully retrieved comments from discussion.');
    (0, core_1.info)(JSON.stringify(result));
    return result.node.comments.nodes;
}
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
// MAIN //
/**
* Main function.
*
* @returns promise indicating completion
*/
async function main() {
    const embeddingsJSON = await (0, promises_1.readFile)((0, path_1.join)(__dirname, '..', 'embeddings.json'), 'utf8');
    const embeddings = JSON.parse(embeddingsJSON);
    try {
        const result = await openai.createEmbedding({
            'input': question,
            'model': 'text-embedding-ada-002'
        });
        (0, core_1.debug)('Successfully created embedding.');
        const embedding = result.data.data[0].embedding;
        const similarities = [];
        for (let i = 0; i < embeddings.length; i++) {
            const similarity = vectorSimilarity(embedding, embeddings[i].embedding);
            similarities.push({
                'embedding': embeddings[i],
                'similarity': similarity
            });
        }
        // Sort similarities in descending order:
        similarities.sort((a, b) => b.similarity - a.similarity);
        // Only keep the top three embeddings that have a similarity greater than 0.6:
        const top = similarities.filter(x => x.similarity > 0.6).slice(0, 3);
        (0, core_1.debug)('Kept top ' + top.length + ' embeddings as context.');
        let conversationHistory;
        switch (github_1.context.eventName) {
            case 'issue_comment':
                {
                    // Get all comments on the issue:
                    const comments = await octokit.issues.listComments({
                        'owner': github_1.context.repo.owner,
                        'repo': github_1.context.repo.repo,
                        'issue_number': github_1.context.payload.issue.number
                    });
                    conversationHistory = comments.data.map(x => x.body).join('\n');
                }
                break;
            case 'discussion_comment':
                {
                    // Get all comments on the discussion via the GraphQL API:
                    const comments = await getDiscussionComments(github_1.context.payload.discussion.id);
                    conversationHistory = comments.map(x => x.body).join('\n');
                }
                break;
        }
        (0, core_1.info)('Conversation history: ' + conversationHistory);
        const prompt = PROMPT
            .replace('{{files}}', top.map(x => {
            let readme = x.embedding.content;
            // Remove the license header:
            readme = readme.replace(/\/\*\*\n \* @license[\s\S]*?\n \*\/\n/gm, '');
            // Replace Windows line endings with Unix line endings:
            readme = readme.replace(/\r\n/g, '\n');
            // Only keep usage sections (surrounded by <section class="usage">...</section>):
            readme = readme.replace(/([\s\S]*?)<section class="usage">([\s\S]*?)<\/section>([\s\S]*)/g, '$2');
            // Remove all code blocks:
            readme = readme.replace(/```[\s\S]*?```/g, '');
            // Remove all link definitions:
            readme = readme.replace(/\[.*?\]:[\s\S]*?\n/g, '');
            // Remove any HTML comments:
            readme = readme.replace(/<!--([\s\S]*?)-->/g, '');
            // Remove any closing </section> tags:
            readme = readme.replace(/<\/section>/g, '');
            // Remove any opening <section class=""> tags:
            readme = readme.replace(/<section class="[^"]+">/g, '');
            // Replace multiple newlines with a single newline:
            readme = readme.replace(/\n{3,}/g, '\n\n');
            return `Package: ${x.embedding.package}\nText: ${readme}`;
        }).join('\n\n'))
            .replace('{{history}}', conversationHistory ? `History:\n${conversationHistory}\n` : '')
            .replace('{{question}}', question);
        (0, core_1.debug)('Assembled prompt: ' + prompt);
        const completionResult = await openai.createCompletion({
            'prompt': prompt,
            'max_tokens': 1500,
            'temperature': 0.5,
            'top_p': 1,
            'model': 'text-davinci-003'
        });
        (0, core_1.debug)('Successfully created completion.');
        const answer = appendDisclaimer(completionResult.data.choices[0].text);
        switch (github_1.context.eventName) {
            case 'issue_comment':
            case 'issues':
                (0, core_1.debug)('Triggered by issue comment or issue.');
                await createComment({
                    owner: github_1.context.repo.owner,
                    repo: github_1.context.repo.repo,
                    issueNumber: github_1.context.issue.number,
                    body: answer
                });
                (0, core_1.debug)('Successfully created comment.');
                break;
            case 'discussion_comment':
            case 'discussion':
                (0, core_1.debug)('Triggered by discussion comment or discussion.');
                addDiscussionComment(github_1.context.payload.discussion.node_id, answer);
                (0, core_1.debug)('Successfully created comment.');
                break;
            default:
                (0, core_1.error)('Unsupported event name: ' + github_1.context.eventName);
        }
    }
    catch (err) {
        switch (github_1.context.eventName) {
            case 'issue_comment':
            case 'issues':
                (0, core_1.debug)('Triggered by issue comment or issue.');
                await createComment({
                    owner: github_1.context.repo.owner,
                    repo: github_1.context.repo.repo,
                    issueNumber: github_1.context.issue.number,
                    body: 'Sorry, I was not able to answer your question.'
                });
                (0, core_1.debug)('Successfully created comment.');
                break;
            case 'discussion_comment':
            case 'discussion':
                (0, core_1.debug)('Triggered by discussion comment or discussion.');
                addDiscussionComment(github_1.context.payload.discussion.node_id, 'Sorry, I was not able to answer your question.');
                (0, core_1.debug)('Successfully created comment.');
                break;
            default:
                (0, core_1.error)('Unsupported event name: ' + github_1.context.eventName);
        }
        (0, core_1.error)(err);
        (0, core_1.setFailed)(err.message);
    }
}
main();
//# sourceMappingURL=index.js.map