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
import { error, debug, getInput, setFailed } from '@actions/core';
import { context } from '@actions/github';
import { Octokit } from '@octokit/rest';
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';
import { readFile } from 'fs/promises';
import { join } from 'path';


// TYPES //

type CreateCommentResponse = Promise<RestEndpointMethodTypes["issues"]["createComment"]["response"]["data"]>	;
type CreateCommentParams = {
	octokit: Octokit;
	owner: string;
	repo: string;
	issueNumber: number;
	body: string;
};


// FUNCTIONS //

/**
* Creates a comment on an issue.
* 
* @private
* @param options - function options
* @param options.octokit - octokit instance
* @param options.owner - repository owner
* @param options.repo - repository name
* @param options.issueNumber - issue number
* @param options.body - comment body
* @returns promise resolving to the response data
*/
async function createComment({ octokit, owner, repo, issueNumber, body }: CreateCommentParams): Promise<CreateCommentResponse> {
	const response = await octokit.issues.createComment({
		'owner': owner,
		'repo': repo,
		'issue_number': issueNumber,
		'body': body
	});
	return response.data;
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
function vectorSimilarity( x: Array<number>, y: Array<number> ): number {
	let sum = 0;
	for ( let i = 0; i < x.length; i++ ) {
		sum += x[ i ] * y[ i ];
	}
	return sum;
}


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
const config = new Configuration({
	'apiKey': OPENAI_API_KEY
});
const openai = new OpenAIApi( config );

const PROMPT = `I am a highly intelligent question answering bot for programming questions in JavaScript. If you ask me a question that is rooted in truth, I will give you the answer. If you ask me a question that is nonsense, trickery, is not related to the stdlib-js / @stdlib project for JavaScript and Node.js or has no clear answer, I will respond with "Unknown.". If the requested functionality is not available or cannot be implemented using stdlib, I will respond with "Not yet implemented.". I will include example code if relevant to the question, formatted as GitHub Flavored Markdown code blocks.

I will answer below question by referencing the following packages from the project:
{{files}}

Question: {{question}}
Answer:`;


// MAIN //

/**
* Main function.
*
* @returns promise indicating completion
*/ 
async function main(): Promise<void> {
	const embeddingsJSON = await readFile( join( __dirname, '..', 'embeddings.json' ), 'utf8' );
	const embeddings = JSON.parse( embeddingsJSON );
	try {
		const result = await openai.createEmbedding({
			'input': question,
			'model': 'text-embedding-ada-002'
		});
		debug( 'Successfully created embedding.' );
		const embedding = result.data.data[ 0 ].embedding;
		const similarities = [];
		for ( let i = 0; i < embeddings.length; i++ ) {
			const similarity = vectorSimilarity( embedding, embeddings[ i ].embedding );
			similarities.push({
				'embedding': embeddings[ i ],
				'similarity': similarity
			});
		}
		// Sort similarities in descending order:
		similarities.sort( ( a, b ) => b.similarity - a.similarity );
		
		// Only keep the top three embeddings that have a similarity greater than 0.6:
		const top = similarities.filter( x => x.similarity > 0.6 ).slice( 0, 3 );
		debug( 'Kept top '+top.length+' embeddings as context.' );
		
		const removeCodeblocks = false;
		const prompt = PROMPT
			.replace( '{{files}}', top.map( x => {
				let readme = x.embedding.content;
				
				// Remove the license header:
				readme = readme.replace( /\/\*\*\n \* @license[\s\S]*?\n \*\/\n/gm, '' );
		
				// Replace Windows line endings with Unix line endings:
				readme = readme.replace( /\r\n/g, '\n' );
				
				// Only keep usage sections (surrounded by <section class="usage">...</section>):
				readme = readme.replace( /([\s\S]*?)<section class="usage">([\s\S]*?)<\/section>([\s\S]*)/g, '$2' );
				
				if ( removeCodeblocks ) {
					// Remove all code blocks:
					readme = readme.replace( /```[\s\S]*?```/g, '' );
				}
					
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
			.replace( '{{question}}', question );
			
		debug( 'Assembled prompt: '+prompt );
		const completionResult = await openai.createCompletion({
			'prompt': prompt,
			'max_tokens': 1500,
			'temperature': 0.5,
			'top_p': 1,
			'model': 'text-davinci-003'
		});
		debug( 'Successfully created completion.' );
		const answer = completionResult.data.choices[ 0 ].text;
		await createComment({
			octokit: new Octokit({ auth: GITHUB_TOKEN }),
			owner: context.repo.owner,
			repo: context.repo.repo,
			issueNumber: context.issue.number,
			body: answer
		});
		debug( 'Successfully created comment.' );
	} catch ( err ) {
		error( err );
		setFailed( err.message );
	}
}

main();