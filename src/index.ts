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

import { error, debug, info, getInput, setFailed } from '@actions/core';
import { context } from '@actions/github';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { setupOpenAI, assemblePrompt, createEmbedding, findMostSimilar, generateAnswer } from './openai';
import { setupGitHub, createComment, addDiscussionComment, generateHistory,
	getDiscussionComments, getIssueComments } from './github';


// VARIABLES //

const OPENAI_API_KEY = getInput( 'OPENAI_API_KEY', {
	required: true
});
setupOpenAI( OPENAI_API_KEY );
const GITHUB_TOKEN = getInput( 'GITHUB_TOKEN', {
	required: true
});
setupGitHub( GITHUB_TOKEN );


// FUNCTIONS //

/**
* Extracts the question from the event payload.
*
* @private
* @returns question
*/
function extractQuestion(): string {
	switch ( context.eventName ) {
	case 'discussion_comment':
	case 'issue_comment':
		debug( 'Triggered by discussion comment or issue comment.' );
		return context.payload.comment.body;
	case 'discussion':
		debug( 'Triggered by discussion.' );
		return context.payload.discussion.body;
	case 'issues':
		debug( 'Triggered by issue.' );
		return context.payload.issue.body;
	}
}


// MAIN //

/**
* Main function.
*
* @returns promise indicating completion
*/
async function main(): Promise<void> {
	const question = extractQuestion();
	const embeddingsJSON = await readFile( join( __dirname, '..', 'embeddings.json' ), 'utf8' );
	const embeddings  = JSON.parse( embeddingsJSON );
	try {
		const embedding = await createEmbedding( question );
		const mostSimilar = await findMostSimilar( embedding, embeddings );

		// Assemble history of the conversation (i.e., previous comments) if the event is a comment event:
		let conversationHistory;
		let comments;
		switch ( context.eventName ) {
		case 'issue_comment':
			comments = await getIssueComments();
			conversationHistory = generateHistory( comments );
			break;
		case 'discussion_comment':
			comments = await getDiscussionComments( context.payload.discussion.node_id );
			conversationHistory = generateHistory( comments );
			break;
		}
		info( 'Conversation history: '+conversationHistory );

		// Assemble prompt for OpenAI GPT-3 by concatenating the conversation history and the most relevant README.md sections:
		const prompt = assemblePrompt( question, mostSimilar, conversationHistory );

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
