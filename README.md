# claude-slack-bridge

A Slack [channel](https://code.claude.com/docs/en/channels-reference) for Claude Code. Message one Slack channel and a running Claude Code session receives it; Claude replies in the same thread. Built for driving a session from your phone, including by voice.

- One owner, one channel. Everything else is dropped: other users, other channels, bots, edits, file shares.
- Slack Socket Mode. No public URL, no open ports.
- Native permission relay: when a tool needs approval, the prompt is posted to Slack with a 5-letter code. Reply `yes abcde` or `no abcde`. Tolerates dictation ("Yes, abcde.").
- Threads: replies go to the thread of the latest message; `new_thread` starts a new one.
- Single-instance lock: Slack hands each event to only one open connection, so the newest session takes over and older ones step down.
- Tools: `reply`, `fetch_thread`. No file uploads, by design.
- ~250 lines of TypeScript plus unit tests.

## Setup

Requires [Bun](https://bun.sh) and a Claude Code version with channels support.

1. Create the Slack app: api.slack.com/apps > Create New App > From a manifest, paste [slack-app-manifest.yml](slack-app-manifest.yml). Install it to your workspace and copy the bot token (`xoxb-...`). Generate an app-level token with `connections:write` (`xapp-...`).
2. Create a channel, invite the bot, and note the channel ID and your own Slack user ID.
3. Copy [examples/env.example](examples/env.example) to `~/.claude/channels/slack/.env`, fill it in, and `chmod 600` it. Never commit this file.
4. `bun install`
5. Copy [examples/mcp.json](examples/mcp.json), set the absolute path to `server.ts`, then start Claude Code with:

   ```
   claude --mcp-config path/to/mcp.json --dangerously-load-development-channels server:claude-slack-bridge
   ```

6. Post in the channel. Claude Code shows the message as a `<channel>` tag and replies with the `reply` tool.

Run the tests with `bun test`.

## Configuration

| Variable | Meaning |
|---|---|
| `SLACK_BOT_TOKEN` | Bot token (`xoxb-...`) |
| `SLACK_APP_TOKEN` | App-level token for Socket Mode (`xapp-...`) |
| `SLACK_OWNERS` | Slack user ID allowed to talk to the session (first entry used) |
| `SLACK_CHANNELS` | Channel ID the bridge uses (first entry used) |
| `SLACK_OWNER_APPS` | Optional, comma-separated app IDs allowed to post as the owner |
| `SLACK_STATE_DIR` | Optional, defaults to `~/.claude/channels/slack` (holds `.env` and the lock file) |

## Security notes

- The session acts on anything the owner posts in that channel. Anyone who can post as you in it can drive your session, so use a private channel and restrict the session's tools and directories.
- Auto permission mode skips approval prompts; use a stricter mode if the session can reach anything sensitive.
- Channels are a research-preview feature, and `--dangerously-load-development-channels` is required until a plugin is on the approved list.

## Credits

This project is a rewrite, not a fork, but it follows the design of two earlier plugins:

- [reef-digital/claude-code-slack](https://github.com/reef-digital/claude-code-slack) (Apache-2.0), a Slack port of the Discord plugin. Its scopes, events and Socket Mode setup informed this one.
- Anthropic's official Discord channel plugin, which that port is based on.

Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk) and [Slack Bolt](https://github.com/slackapi/bolt-js).

## License

[Apache 2.0](LICENSE)
