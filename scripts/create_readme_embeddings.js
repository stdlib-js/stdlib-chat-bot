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

const findREADMEs = require( '@stdlib/_tools/pkgs/readmes' );
const substringAfter = require( '@stdlib/string/substring-after' );
const { OpenAIApi , Configuration } = require( 'openai' );
const join = require( 'path' ).join;
const fs = require( 'fs' );


// VARIABLES //

const oldEmbeddings = require( './../embeddings.json' );
const config = new Configuration({
	'apiKey': process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi( config );
const MAX_LENGTH = 10000;


// FUNCTIONS //

function sleep( ms ) {
	return new Promise( resolve => setTimeout( resolve, ms ) );
}


// MAIN //

async function run() {
	const files = findREADMEs.sync({
		'dir': join( __dirname, '..', '..', 'stdlib', 'lib', 'node_modules', '@stdlib' ),
	});
	const out = oldEmbeddings.slice();
	for ( let i = 0; i < files.length; i++ ) {
		// console.log( 'Processing: %s', files[i] );
		const package = substringAfter( files[i], 'node_modules\\' )
			.replace( /\\/g, '/' )
			.replace( '/README.md', '' );

		let readme = fs.readFileSync( files[i], 'utf8' );

		// Remove license comments:
		readme = readme.replace( /<!--\n\n@license[\s\S]*?-->/gm, '' );

		// Replace Windows line endings with Unix line endings:
		readme = readme.replace( /\r\n/g, '\n' );

		// Check if we already have an embedding for the file:
		const idx = out.findIndex( x => x.package === package );
		if ( idx !== -1 ) {
			// console.log( 'Already have an embedding for: %s. Updating content only.', package );
			out[ idx ].content = readme;
			continue;
		}

		// Remove any HTML comments:
		let txt = readme.replace( /<!--([\s\S]*?)-->/g, '' );

		// Remove any closing </section> tags:
		txt = txt.replace( /<\/section>/g, '' );

		// Remove any opening <section class=""> tags:
		txt = txt.replace( /<section class="[^"]+">/g, '' );

		// Remove multiple newlines (Unix):
		txt = txt.replace( /(\n){3,}/g, '\n\n' );

		if ( txt.length > MAX_LENGTH ) {
			console.log( 'Too long: %s', files[i] );
			txt = txt.replace( /```[\s\S]*?```/g, '' );
			console.log( 'Checking length after removing code blocks...' );
			if ( txt.length > MAX_LENGTH ) {
				console.log( 'Still to long, truncate: %s', files[i] );
				txt = txt.substring( 0, MAX_LENGTH );
			}
		}

		const result = await openai.createEmbedding({
			'input': txt,
			'model': 'text-embedding-ada-002'
		});
		const json = {
			'package': package,
			'content': readme,
			'embedding': result.data.data[ 0 ].embedding
		};
		out.push( json );
		sleep( 300 );
		if ( i % 10 === 0 ) {
			fs.writeFileSync( join( __dirname, '..', 'embeddings.json' ), JSON.stringify( out ) );
		}
	}
	fs.writeFileSync( join( __dirname, '..', 'embeddings.json' ), JSON.stringify( out ) );
}

run();
