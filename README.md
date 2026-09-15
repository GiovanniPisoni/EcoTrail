# EcoTrail

Crowdsensing web application for real-time monitoring of the condition
of hiking trails.

Project for the Web Applications and Services course – University of Bologna.
Giovanni Pisoni, Giovanni Rinchiuso.

## Requirements

- Node.js >= 22.18
- Docker (for MongoDB)

## Local launch

```bash
git clone https://github.com/<user>/ecotrail.git
cd ecotrail
npm install
cp server/.env.example server/.env
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3000/api/health

## Structure

- `client/` - frontend Vue 3 (Vite, Vue Router, Pinia)
- `server/` - backend Node.js + Express
- `docs/` - LaTeX report

## Comandi utili

| Command          | What it does                          |
| ---------------- | ------------------------------------- |
| `npm run dev`    | starts the client and server together |
| `npm run lint`   | checks the code with ESLint           |
| `npm run format` | formats the code with Prettier        |

## How we work

- `main` must always be working: no direct commits
- one branch per task: `feature/<task-number>-<description>`
- every merge goes through a pull request approved by the other person
