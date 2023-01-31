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

// MODULES //

// MODULES //

import { OpenAIApi , Configuration } from 'openai';
import { error, debug, info, getInput, setFailed } from '@actions/core';
import { context } from '@actions/github';
import { graphql, GraphQlQueryResponseData } from '@octokit/graphql';
import { Octokit } from '@octokit/rest';
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';
import { readFile } from 'fs/promises';
import { join } from 'path';


// TYPES //

type CreateCommentResponse = Promise<RestEndpointMethodTypes['issues']['createComment']['response']['data']>;
type CreateCommentParams = {
	owner: string;
	repo: string;
	issueNumber: number;
	body: string;
};
type Comment = {
	author: {
		login: string;
	};
	body: string;
};


// VARIABLES //

const OPENAI_API_KEY = getInput( 'OPENAI_API_KEY', {
	required: true
});
const GITHUB_TOKEN = getInput( 'GITHUB_TOKEN', {
	required: true
});
const question = getInput( 'question', {
	required: true
});
const graphqlWithAuth = graphql.defaults({
	headers: {
		authorization: `token ${GITHUB_TOKEN}`
	},
});
const octokit = new Octokit({
	auth: GITHUB_TOKEN
});
const config = new Configuration({
	'apiKey': OPENAI_API_KEY
});
const openai = new OpenAIApi( config );

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
function appendDisclaimer( str: string ): string {
	return str + '\n\n### Disclaimer\n\n-   This answer was generated with the help of AI and is not guaranteed to be correct. We will review the answer and update it if necessary.\n-   You can also ask follow-up questions to clarify the answer or request additional information by leaving a comment on this issue starting with `/ask`.';
}

/**
* Strips a disclaimer from a string containing an answer.
*
* @private
* @param str - string from which to strip disclaimer
* @returns string with disclaimer stripped
*/
function stripDisclaimer( str: string ): string {
	return str.replace( /### Disclaimer[\s\S]+$/, '' );
}

/**
* Generates a history string for the prompt based on previous comments in a discussion or issue.
*
* @private
* @param comments - comments
* @returns history string
*/
function generateHistory( comments: Array<Comment> ): string {
	let history = '';
	for ( let i = 0; i < comments.length; i++ ) {
		const comment = comments[ i ];
		history += comment.author.login+': '+stripDisclaimer( comment.body );
		history += '\n';
	}
	return history;
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
async function createComment({ owner, repo, issueNumber, body }: CreateCommentParams): CreateCommentResponse {
	const response = await octokit.issues.createComment({
		'owner': owner,
		'repo': repo,
		'issue_number': issueNumber,
		'body': body
	});
	return response.data;
}

/**
* Returns a list of comments on an issue.
*
* @private
* @returns promise resolving to a list of comments
*/
async function getIssueComments(): Promise<Array<Comment>> {
	const response = await octokit.issues.listComments({
		'owner': context.repo.owner,
		'repo': context.repo.repo,
		'issue_number': context.payload.issue.number
	});
	return response.data.map( o => {
		return {
			'author': {
				'login': o.user.login
			},
			'body': o.body
		};
	});
}

/**
* Adds a comment to a discussion.
*
* @private
* @param discussionId - discussion id
* @param body - comment body
* @returns promise resolving to the comment
*/
async function addDiscussionComment( discussionId: string, body: string ): Promise<GraphQlQueryResponseData> {
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
	const result = await graphqlWithAuth( query, variables );
	return result;
}

/**
* Returns the comments for a discussion via the GitHub GraphQL API.
*
* @private
* @param discussionId - discussion id
* @returns promise resolving to the comments
*/
async function getDiscussionComments( discussionId: string ): Promise<Array<Comment>> {
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
	const result: GraphQlQueryResponseData = await graphqlWithAuth( query, variables );
	return result.node.comments.nodes;
}

/**
* Generates an embedding for a given question.
*
* @private
* @param question - question
* @returns promise resolving to the embedding vector
*/
async function createEmbedding( question: string ): Promise<number[]> {
	const result = await openai.createEmbedding({
		'input': question,
		'model': 'text-embedding-ada-002'
	});
	return result.data.data[ 0 ].embedding;
}

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
async function findMostSimilar(
	embedding: number[],
	allEmbeddings: Array<{
		package: string;
		content: string;
		embedding: number[];
	}>,
	topN = 3,
	threshold = 0.6
): Promise<Array<{
	embedding: {
		package: string;
		content: string;
		embedding: number[];
	};
	similarity: number;
}>> {
	const similarities = new Array( allEmbeddings.length );
	for ( let i = 0; i < allEmbeddings.length; i++ ) {
		const similarity = vectorSimilarity( embedding, allEmbeddings[ i ].embedding );
		similarities[ i ] = {
			'embedding': allEmbeddings[ i ],
			'similarity': similarity
		};
	}
	// Sort similarities in descending order:
	similarities.sort( ( a, b ) => b.similarity - a.similarity );

	// Only keep the top N embeddings that have a similarity greater than the threshold:
	return similarities
		.filter( x => x.similarity > threshold )
		.slice( 0, topN );
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
function vectorSimilarity( x: number[], y: number[] ): number {
	let sum = 0;
	for ( let i = 0; i < x.length; i++ ) {
		sum += x[ i ] * y[ i ];
	}
	return sum;
}

/**
* Generates an answer to a given prompt.
*
* @private
* @param prompt - prompt
* @returns promise resolving to the answer
*/
async function generateAnswer( prompt: string ): Promise<string> {
	const completionResult = await openai.createCompletion({
		'prompt': prompt,
		'max_tokens': 1500,
		'temperature': 0.5,
		'top_p': 1,
		'model': 'text-davinci-003'
	});
	let out = completionResult.data.choices[ 0 ].text;
	out = appendDisclaimer( out );
	return out;
}


// MAIN //

/**
* Main function.
*
* @returns promise indicating completion
*/
async function main(): Promise<void> {
	const embeddingsJSON = await readFile( join( __dirname, '..', 'embeddings.json' ), 'utf8' );
	const embeddings  = JSON.parse( embeddingsJSON );
	try {
		const embedding = await createEmbedding( question );
		const mostSimilar = await findMostSimilar( embedding, embeddings );

		// Assemble history of the conversation (i.e., previous comments) if the event is a comment event:
		let conversationHistory;
		switch ( context.eventName ) {
			case 'issue_comment': {
				const comments = await getIssueComments();
				conversationHistory = generateHistory( comments );
			}
			break;
			case 'discussion_comment': {
				const comments = await getDiscussionComments( context.payload.discussion.node_id );
				conversationHistory = generateHistory( comments );
			}
			break;
		}
		info( 'Conversation history: '+conversationHistory );

		// Assemble prompt for OpenAI GPT-3 by concatenating the conversation history and the most relevant README.md sections:
		const prompt = PROMPT
			.replace( '{{files}}', mostSimilar.map( x => {
				let readme = x.embedding.content;

				// Remove the license header:
				readme = readme.replace( /\/\*\*\n \* @license[\s\S]*?\n \*\/\n/gm, '' );

				// Replace Windows line endings with Unix line endings:
				readme = readme.replace( /\r\n/g, '\n' );

				// Only keep usage sections (surrounded by <section class="usage">...</section>):
				readme = readme.replace( /([\s\S]*?)<section class="usage">([\s\S]*?)<\/section>([\s\S]*)/g, '$2' );

				// Remove all code blocks:
				readme = readme.replace( /```[\s\S]*?```/g, '' );

				// Remove all link definitions:
				readme = readme.replace( /\[.*?\]:[\s\S]*?\n/g, '' );

				// Remove any HTML comments:
				readme = readme.replace( /<!--([\s\S]*?)-->/g, '' );

				// Remove any closing </section> tags:
				readme = readme.replace( /<\/section>/g, '' );

				// Remove any opening <section class=""> tags:
				readme = readme.replace( /<section class="[^"]+">/g, '' );

				// Replace multiple newlines with a single newline:
				readme = readme.replace( /\n{3,}/g, '\n\n' );

				return `Package: ${x.embedding.package}\nText: ${readme}`;
			}).join( '\n\n' ) )
			.replace( '{{history}}', conversationHistory ? `History:\n${conversationHistory}\n` : '' )
			.replace( '{{question}}', question );

		debug( 'Assembled prompt: '+prompt );
		const answer = await generateAnswer( prompt );

		switch ( context.eventName ) {
		case 'issue_comment':
		case 'issues':
			debug( 'Triggered by issue comment or issue.' );
			await createComment({
				owner: context.repo.owner,
				repo: context.repo.repo,
				issueNumber: context.issue.number,
				body: answer
			});
			debug( 'Successfully created comment.' );
		break;
		case 'discussion_comment':
		case 'discussion':
			debug( 'Triggered by discussion comment or discussion.' );
			addDiscussionComment( context.payload.discussion.node_id, answer );
			debug( 'Successfully created comment.' );
		break;
		default:
			error( 'Unsupported event name: '+context.eventName );
		}
	} catch ( err ) {
		switch ( context.eventName ) {
		case 'issue_comment':
		case 'issues':
			debug( 'Triggered by issue comment or issue.' );
			await createComment({
				owner: context.repo.owner,
				repo: context.repo.repo,
				issueNumber: context.issue.number,
				body: 'Sorry, I was not able to answer your question.'
			});
			debug( 'Successfully created comment.' );
		break;
		case 'discussion_comment':
		case 'discussion':
			debug( 'Triggered by discussion comment or discussion.' );
			addDiscussionComment( context.payload.discussion.node_id, 'Sorry, I was not able to answer your question.' );
			debug( 'Successfully created comment.' );
		break;
		default:
			error( 'Unsupported event name: '+context.eventName );
		}
		error( err );
		setFailed( err.message );
	}
}

main();
