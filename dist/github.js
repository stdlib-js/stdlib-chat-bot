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
exports.getDiscussionComments = exports.addDiscussionComment = exports.getIssueComments = exports.generateHistory = exports.createComment = exports.setupGitHub = void 0;
// MODULES //
const github_1 = require("@actions/github");
const graphql_1 = require("@octokit/graphql");
const rest_1 = require("@octokit/rest");
// VARIABLES //
let graphqlWithAuth;
let octokit;
// FUNCTIONS //
/**
* Sets up the GitHub API.
*
* @private
* @param token - GitHub token
*/
function setupGitHub(token) {
    graphqlWithAuth = graphql_1.graphql.defaults({
        headers: {
            authorization: `token ${token}`
        },
    });
    octokit = new rest_1.Octokit({
        auth: token
    });
}
exports.setupGitHub = setupGitHub;
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
exports.createComment = createComment;
/**
* Returns a list of comments on an issue.
*
* @private
* @returns promise resolving to a list of comments
*/
async function getIssueComments() {
    const response = await octokit.issues.listComments({
        'owner': github_1.context.repo.owner,
        'repo': github_1.context.repo.repo,
        'issue_number': github_1.context.payload.issue.number
    });
    return response.data.map(o => {
        return {
            'author': {
                'login': o.user.login
            },
            'body': o.body
        };
    });
}
exports.getIssueComments = getIssueComments;
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
    return result;
}
exports.addDiscussionComment = addDiscussionComment;
/**
* Returns the comments for a discussion via the GitHub GraphQL API.
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
    return result.node.comments.nodes;
}
exports.getDiscussionComments = getDiscussionComments;
/**
* Strips a disclaimer from a string containing an answer.
*
* @private
* @param str - string from which to strip disclaimer
* @returns string with disclaimer stripped
*/
function stripDisclaimer(str) {
    return str.replace(/### Disclaimer[\s\S]+$/, '');
}
/**
* Generates a history string for the prompt based on previous comments in a discussion or issue.
*
* @private
* @param comments - comments
* @returns history string
*/
function generateHistory(comments) {
    let history = '';
    for (let i = 0; i < comments.length; i++) {
        const comment = comments[i];
        history += comment.author.login + ': ' + stripDisclaimer(comment.body);
        history += '\n';
    }
    return history;
}
exports.generateHistory = generateHistory;
//# sourceMappingURL=github.js.map