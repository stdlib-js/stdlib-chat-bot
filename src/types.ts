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

import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';


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
type Embedding = {
	package: string;
	content: string;
	embedding: number[];
};


// EXPORTS //

export { CreateCommentParams, CreateCommentResponse, Comment, Embedding };
