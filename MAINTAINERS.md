# Maintainers

Open items and things to verify, for people maintaining this project. User-facing docs state only what is known; anything still unconfirmed is tracked here.

## Install

- [ ] Confirm the minimum Claude Code version with channels support, and state it in the README.
- [ ] Test the marketplace install (`/plugin marketplace add` + `/plugin install`, and the `claude plugin` CLI form) end to end on a fresh machine.
- [ ] Run the plugin on Linux (and Windows, if supported); it has only been run on macOS so far.
- [ ] Confirm whether any paid plan (Slack or claude.ai) is required beyond the Team/Enterprise Owner toggle for channels.

## Slack setup

- [ ] Verify the Slack UI steps in "Finding the IDs" (channel ID in the About tab, Copy link, profile menu > Copy member ID) against the current Slack desktop and web apps.
