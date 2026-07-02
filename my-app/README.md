# my-app

Scaffolded with [@inneranimalmedia/agentsam-sdk](https://www.npmjs.com/package/@inneranimalmedia/agentsam-sdk).

## Lane

**CMS** — orchestrator agent, Cloudflare Workers

## Setup

```bash
cp .env.example .env
npm install
```

## Dev

```bash
npm run dev
npm run smoke
```

## Deploy

```bash
npm run deploy
```

## Endpoints

- `GET /api/health`
- `GET /api/agentsam/info`
- `POST /api/agentsam/session`
- `POST /api/agentsam/message`
