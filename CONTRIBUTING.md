# Contributing

Thanks for helping. A few things make changes easy to accept.

## Setup

```sh
bun install
bun run src/cli.ts login     # once, to try commands against your own account
bun src/cli.ts help
```

Before opening a pull request:

```sh
bun run check && bun run typecheck && bun test
```

## Guidelines

- **Output is for agents.** Every line an agent reads costs tokens. Keep output terse and id-first, and run `bun run bench` before and after changes to output.
- **Errors say what to do next.** A refusal names the fix ("use 102x2", "add one of: …"), in one line, with no stack trace.
- **Test logic, not wiring.** Pure logic (item specs, option resolution, required items) has tests in `test/`. Tests never call Meituan.
- **Be gentle with Meituan.** Bursts of requests get endpoints blocked for everyone using that IP. Load things a few at a time and cache what you can.
- **Never commit personal data.** Sessions, addresses, phone numbers and order ids stay out of the repo, fixtures and examples included.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org): `fix(menu): keep required categories complete`.

## Reverse-engineered endpoints

Request field sets are copied from the site's own traffic, because endpoints reject calls missing any of them. When an endpoint changes, capture the site's request (browser devtools, mobile emulation) and update the matching module in `src/meituan/`.
