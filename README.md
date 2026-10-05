# Little by little — Smoke Tracker

A private, local-first cigarette tracker built with React, TypeScript, and Vite. It helps you notice your smoking patterns without judgment, set a personal daily goal, and work toward a quit date at your own pace.

## Features

- Onboarding for your name, daily cigarette goal, MMK cost per cigarette, and quit target date.
- Daily progress ring, estimated spending, smoke-free timer, and a confirmation before logging a cigarette.
- Search-free smoke log with Today/All filters and pagination.
- Monthly calendar with daily totals and goal status.
- Insights with monthly summaries, weekly averages, and a seven-day chart.
- Quit plan countdown, editable target date, and a manually earned quit-completion badge.
- Progress badges for tracking milestones and logged days at or below your personal goal.
- JSON backup and restore to move your profile and logs between devices.
- Responsive neo-brutalist interface with keyboard-friendly controls and reduced-motion support.

## Getting started

Requirements: Node.js and npm.

```sh
npm install
npm run dev
```

Vite prints the local development URL in the terminal.

## Available scripts

```sh
npm run dev      # Start the development server
npm run build    # Type-check and create a production build in dist/
npm run lint     # Run ESLint
npm run preview  # Preview the production build locally
```

## Your data and backups

The app stores your profile and smoke logs in this browser's local storage. It does not sync data to a server. Clearing browser storage or moving to another browser/device does not transfer your tracker automatically.

Use **Backup** to download a JSON file. On another device, open the app and choose that file under **Restore**. Restore validates the backup and asks for confirmation; restoring replaces the profile and smoke logs currently stored in that browser. Keep backup files private because they contain your personal tracker data.

## Tech stack

- React 19
- TypeScript
- Vite
- CSS

## Production build

Run `npm run build`, then serve the generated `dist/` directory with a static web host.
