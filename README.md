# AI News Aggregator

A minimal AI news aggregation website that monitors X (Twitter) accounts and summarizes posts using Claude.

## Tech Stack

- Next.js 14 (App Router)
- TailwindCSS
- SQLite (better-sqlite3)
- node-cron
- Anthropic Claude API

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Keys

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```
X_API_KEY=your_x_bearer_token
X_API_SECRET=your_x_api_secret
ANTHROPIC_API_KEY=your_anthropic_api_key
```

**Note:** For X API, use your Bearer Token as `X_API_KEY`. Get it from https://developer.twitter.com/

### 3. Initialize Database

```bash
npm run init-db
```

### 4. Configure Sources

Edit `data/sources.json` to add or remove X accounts to monitor.

## Usage

### Run Development Server

```bash
npm run dev
```

Visit http://localhost:3000

### Fetch Posts Manually

```bash
npm run fetch
```

### Schedule Automatic Fetching

The project includes node-cron for scheduling. To enable hourly fetching, you can:

1. Create a background service
2. Use a cron job on your system
3. Deploy to a platform with scheduled tasks

Example cron setup (add to your system crontab):
```
0 * * * * cd /path/to/ai-news-site && npm run fetch
```

## Project Structure

```
ai-news-site/
├── app/
│   ├── page.tsx          # Main page displaying posts
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles
├── lib/
│   ├── db.ts            # Database connection and schema
│   ├── x.ts             # X API integration
│   └── claude.ts        # Claude API integration
├── scripts/
│   ├── init-db.ts       # Database initialization
│   └── fetch-posts.ts   # Fetch and process posts
├── data/
│   └── sources.json     # Monitored accounts configuration
└── database/
    └── news.db          # SQLite database (created after init)
```

## Features

- Monitors configured X accounts
- Fetches latest posts via X API
- Generates Chinese AI summaries using Claude
- Stores posts in SQLite database
- Displays posts with summaries in a clean UI
- Prevents duplicate posts

## License

MIT
