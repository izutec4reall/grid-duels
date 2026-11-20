# Grid Duels

Two-player tic-tac-toe, connect four and five in a row for your team: play a teammate through a link, get matched online or take on the computer, chat during games, run tournaments and climb the rankings.

Inspired by papergames.io

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Play tic-tac-toe, connect four or five in a row, with every move checked on the server.
- Send a teammate a link to a match; anyone else who opens it watches live.
- Join a queue and get paired with another member waiting for the same game.
- Play the computer, which takes wins and blocks yours.
- Chat and send reactions during a match.
- Run leaderboard, single-elimination or round-robin tournaments from a shareable link.
- See per-game rankings and replay any finished game from your history.

Left out: accounts and sign-in, which your Gateway handles; the other board and card games; the coin shop and avatars; ads and paid passes; double elimination; daily site-run tournaments; native mobile apps; and the developer API.

## Setup

```sh
pnpm install
pnpm dev          # run locally, signed in as a test user
pnpm test         # rules, computer and pairing unit tests
pnpm run deploy   # deploy behind your EveryApp Gateway
```

The release checks in `checks/` run against a packaged release with the EveryApp runtime. There are no secrets or settings: the database is the app's own D1 binding, and sign-in comes from the Gateway.

## Limitations

- Boards refresh by polling every second, not by push.
- Display names are the part of each member's email before the @.
- Games have no clock; an abandoned game stays open until a player resigns.
- Deploying to Cloudflare was not run here; only the local release checks were.
