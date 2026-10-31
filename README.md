# claude-slack-bridge

A Slack [channel](https://code.claude.com/docs/en/channels-reference) for Claude Code. Message one Slack channel and a running Claude Code session receives it; Claude replies in the same thread. Built for driving a session from your phone, including by voice.

For the end-to-end setup (Slack, voice Claude on your phone, and an always-on Mac runner), see [voice-to-claude-code](https://github.com/MatteoPerona/voice-to-claude-code). This README covers the plugin alone.

- One owner, one channel. Everything else is dropped: other users, other channels, bots, edits, file shares.
- Slack Socket Mode. No public URL, no open ports.
- Native permission relay: when a tool needs approval, the prompt is posted to Slack with a 5-letter code. Reply `yes abcde` or `no abcde`. Tolerates dictation ("Yes, abcde.").
- Threads: replies go to the thread of the latest message; `new_thread` starts a new one.
- Single-instance lock: Slack hands each event to only one open connection, so the newest session takes over and older ones step down.
- Tools: `reply`, `fetch_thread`. No file uploads, by design.
- ~250 lines of TypeScript plus unit tests.

## Install

Requirements:

- [Bun](https://bun.sh): `brew install oven-sh/bun/bun`, or `curl -fsSL https://bun.sh/install | bash`.
- A recent Claude Code release with channels support, logged in with a claude.ai account or a Console API key. On claude.ai Team and Enterprise plans an Owner must enable channels first.
- A Slack workspace where you can create and install apps.

The plugin has no macOS-specific code and should run wherever Bun and Claude Code run. The always-on runner in [voice-to-claude-code](https://github.com/MatteoPerona/voice-to-claude-code) is macOS only.

1. **Create the Slack app.** At api.slack.com/apps choose Create New App > From a manifest and paste [slack-app-manifest.yml](slack-app-manifest.yml). Install it to your workspace and copy the bot token (`xoxb-...`). Generate an app-level token with `connections:write` (`xapp-...`).
2. **Create a channel**, invite the bot, and note the channel ID and your own Slack user ID (see [Finding the IDs](#finding-the-ids)).
3. **Add your config.** Copy [examples/env.example](examples/env.example) to `~/.claude/channels/slack/.env`, fill it in, and `chmod 600` it. Never commit this file.
4. **Install the plugin** from inside Claude Code:

   ```
   /plugin marketplace add MatteoPerona/claude-slack-bridge
   /plugin install slack-bridge@matteoperona-plugins
   ```

   Or from a terminal:

   ```
   claude plugin marketplace add MatteoPerona/claude-slack-bridge
   claude plugin install slack-bridge@matteoperona-plugins
   ```

5. **Start a session with the channel enabled.** Channels are a research preview, and custom plugins are not on the approved list yet, so use the development flag:

   ```
   claude --dangerously-load-development-channels plugin:slack-bridge@matteoperona-plugins
   ```

6. Post in the channel. Claude Code shows the message as a `<channel>` tag and replies with the `reply` tool.

### Without the plugin system

Clone the repo, run `bun install`, copy [examples/mcp.json](examples/mcp.json) and set the absolute path to `server.ts`, then:

```
claude --mcp-config path/to/mcp.json --dangerously-load-development-channels server:slack-bridge
```

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

### Finding the IDs

- **Channel ID** (`SLACK_CHANNELS`): open the channel, click its name, and the ID (`C...`) is at the bottom of the About tab. Or right-click the channel, choose Copy link, and take the last path segment.
- **Your member ID** (`SLACK_OWNERS`): open your profile, then the ⋯ menu, then Copy member ID (`U...`).
- **App ID** (`SLACK_OWNER_APPS`): needed only when another app posts as you, for example a connector using your user token. The plugin compares the message's `app_id` (`A...`), not its `bot_id` (`B...`). Post one message through that app, then list the channel's recent messages with the bot token:

  ```
  bun --env-file ~/.claude/channels/slack/.env -e 'const r = await fetch(`https://slack.com/api/conversations.history?channel=${process.env.SLACK_CHANNELS}&limit=10`, { headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` } }).then((r) => r.json()); if (!r.ok) console.log(r.error); for (const m of r.messages ?? []) console.log(m.user, m.bot_id ?? "-", m.app_id ?? "-", (m.text ?? "").slice(0, 40))'
  ```

  Each line is user, bot ID, app ID, start of text. Take the app ID from your test message: the line with your member ID and a bot ID. Lines from the bridge's own replies show the bridge bot's user ID instead; don't allowlist that app.

## Security notes

- The session acts on anything the owner posts in that channel. Anyone who can post as you in it can drive your session, so use a private channel and restrict the session's tools and directories.
- Auto permission mode skips most approval prompts; use a stricter mode if the session can reach anything sensitive. Prompts that still appear are relayed to the thread (see above), and anyone who can post as you can answer them.
- Channels are a research-preview feature, and `--dangerously-load-development-channels` is required until a plugin is on the approved list.

## Credits

This project is a rewrite, not a fork, but it follows the design of two earlier plugins:

- [reef-digital/claude-code-slack](https://github.com/reef-digital/claude-code-slack) (Apache-2.0), a Slack port of the Discord plugin. Its scopes, events and Socket Mode setup informed this one.
- Anthropic's official Discord channel plugin, which that port is based on.

Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk) and [Slack Bolt](https://github.com/slackapi/bolt-js).

## License

[Apache 2.0](LICENSE)

Open items for maintainers: [MAINTAINERS.md](MAINTAINERS.md).
