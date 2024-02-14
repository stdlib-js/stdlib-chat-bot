# stdlib chat bot

> A GitHub action that provides a chat bot for GitHub issues and discussions.

## Inputs

-   `OPENAI_API_KEY`: OpenAI API key.
-   `GITHUB_TOKEN`: GitHub token.

## Example Workflows

### Issue

In the following example workflow, the bot will respond to issues that start with `/ask `.

```yaml
# Workflow triggers:
on:
  issues:
    types: [opened]
    
# Workflow jobs:
jobs:
  respond:
    # Define a display name:
    name: 'Respond to issue'

    # Define the conditions under which the job should run:
    if : startsWith( github.event.issue.body, '/ask ' )

    # Define the type of virtual host machine:
    runs-on: ubuntu-latest

    # Define the sequence of job steps:
    steps:
      # Run the action:
      - name: 'Run action'
        uses: stdlib-js/stdlib-chat-bot@main
        with:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.CHATBOT_GITHUB_TOKEN }}
```

### Issue Comment

On issue comments, the bot will only respond to comments that start with `/ask `.

```yaml
# Workflow triggers:
on:
  issue_comment:
    types: [created]

# Workflow jobs:
jobs:
  respond:
    # Define a display name:
    name: 'Respond to issue comment'

    # Define the conditions under which the job should run:
    if : startsWith( github.event.comment.body, '/ask ' )

    # Define the type of virtual host machine:
    runs-on: ubuntu-latest

    # Define the sequence of job steps:
    steps:
      # Run the action:
      - name: 'Run action'
        uses: stdlib-js/stdlib-chat-bot@main
        with:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.CHATBOT_GITHUB_TOKEN }}
```

### Discussion

On discussion creation, the bot will respond to the discussion if the discussion category is `Q&A`.

```yaml
# Workflow triggers:
on:
  discussion:
    types: [created]
    
# Workflow jobs:
jobs:
  respond:
    # Define a display name:
    name: 'Respond to created discussion'

    # Define the conditions under which the job should run:
    if : github.event.discussion.category.name == 'Q&A'

    # Define the type of virtual host machine:
    runs-on: ubuntu-latest

    # Define the sequence of job steps:
    steps:
      # Run the action:
      - name: 'Run action'
        uses: stdlib-js/stdlib-chat-bot@main
        with:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.CHATBOT_GITHUB_TOKEN }}
```

### Discussion Comment

On discussion comment creation, the bot will respond to the discussion if the comment body starts with `/ask `.

```yaml
# Workflow triggers:
on:
  discussion_comment:
    types: [created]
    
# Workflow jobs:
jobs:
  respond:
    # Define a display name:
    name: 'Respond to discussion comment'

    # Define the conditions under which the job should run:
    if : startsWith( github.event.comment.body, '/ask ' )

    # Define the type of virtual host machine:
    runs-on: ubuntu-latest

    # Define the sequence of job steps:
    steps:
      # Run the action:
      - name: 'Run action'
        uses: stdlib-js/stdlib-chat-bot@main
        with:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.CHATBOT_GITHUB_TOKEN }}
```

## License

See [LICENSE][stdlib-license].


## Copyright

Copyright &copy; 2023-2024. The Stdlib [Authors][stdlib-authors].

<!-- Section for all links. Make sure to keep an empty line after the `section` element and another before the `/section` close. -->

<section class="links">

[stdlib]: https://github.com/stdlib-js/stdlib

[stdlib-authors]: https://github.com/stdlib-js/stdlib/graphs/contributors

[stdlib-license]: https://raw.githubusercontent.com/stdlib-js/stdlib-chat-bot/main/LICENSE

</section>

<!-- /.links -->
