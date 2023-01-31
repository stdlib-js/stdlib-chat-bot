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
const core_1 = require("@actions/core");
const github_1 = require("@actions/github");
'@octokit/plugin-rest-endpoint-methods';
const promises_1 = require("fs/promises");
const path_1 = require("path");
const openai_1 = require("./openai");
const github_2 = require("./github");
// VARIABLES //
const OPENAI_API_KEY = (0, core_1.getInput)('OPENAI_API_KEY', {
    required: true
});
(0, openai_1.setupOpenAI)(OPENAI_API_KEY);
const GITHUB_TOKEN = (0, core_1.getInput)('GITHUB_TOKEN', {
    required: true
});
(0, github_2.setupGitHub)(GITHUB_TOKEN);
// FUNCTIONS //
/**
* Extracts the question from the event payload.
*
* @private
* @returns question
*/
function extractQuestion() {
    switch (github_1.context.eventName) {
        case 'discussion_comment':
        case 'issue_comment':
            (0, core_1.debug)('Triggered by discussion comment or issue comment.');
            return github_1.context.payload.comment.body;
        case 'discussion':
            (0, core_1.debug)('Triggered by discussion.');
            return github_1.context.payload.discussion.body;
        case 'issues':
            (0, core_1.debug)('Triggered by issue.');
            return github_1.context.payload.issue.body;
    }
}
// MAIN //
/**
* Main function.
*
* @returns promise indicating completion
*/
async function main() {
    const question = extractQuestion();
    const embeddingsJSON = await (0, promises_1.readFile)((0, path_1.join)(__dirname, '..', 'embeddings.json'), 'utf8');
    const embeddings = JSON.parse(embeddingsJSON);
    try {
        const embedding = await (0, openai_1.createEmbedding)(question);
        const mostSimilar = await (0, openai_1.findMostSimilar)(embedding, embeddings);
        // Assemble history of the conversation (i.e., previous comments) if the event is a comment event:
        let conversationHistory;
        let comments;
        switch (github_1.context.eventName) {
            case 'issue_comment':
                comments = await (0, github_2.getIssueComments)();
                conversationHistory = (0, github_2.generateHistory)(comments);
                break;
            case 'discussion_comment':
                comments = await (0, github_2.getDiscussionComments)(github_1.context.payload.discussion.node_id);
                conversationHistory = (0, github_2.generateHistory)(comments);
                break;
        }
        (0, core_1.info)('Conversation history: ' + conversationHistory);
        // Assemble prompt for OpenAI GPT-3 by concatenating the conversation history and the most relevant README.md sections:
        const prompt = (0, openai_1.assemblePrompt)(question, mostSimilar, conversationHistory);
        (0, core_1.debug)('Assembled prompt: ' + prompt);
        const answer = await (0, openai_1.generateAnswer)(prompt);
        switch (github_1.context.eventName) {
            case 'issue_comment':
            case 'issues':
                (0, core_1.debug)('Triggered by issue comment or issue.');
                await (0, github_2.createComment)({
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
                (0, github_2.addDiscussionComment)(github_1.context.payload.discussion.node_id, answer);
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
                await (0, github_2.createComment)({
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
                (0, github_2.addDiscussionComment)(github_1.context.payload.discussion.node_id, 'Sorry, I was not able to answer your question.');
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