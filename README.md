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
- `docs/` - LaTeX report and database schema

## Comandi utili

| Command          | What it does                          |
| ---------------- | ------------------------------------- |
| `npm run dev`    | starts the client and server together |
| `npm run lint`   | checks the code with ESLint           |
| `npm run format` | formats the code with Prettier        |

## Publishing

The app is published as a single service: the Express server also serves the
built client, so the site and the API share one HTTPS address. The database is
a free MongoDB Atlas cluster and the service runs on Render (`render.yaml`
describes it).

1. **MongoDB Atlas**: create a free cluster, a database user, allow access from
   anywhere (`0.0.0.0/0`) and copy the connection string, adding the database
   name (`.../EcoTrail?retryWrites=true&w=majority`).
2. **Secrets**: generate a VAPID key pair with `npx web-push generate-vapid-keys`
   (from the `server` folder) and a long random `JWT_SECRET`. Do not reuse the
   development ones.
3. **Render**: create a new Blueprint from this repository. It reads
   `render.yaml` and asks for the variables below.
4. **First data**: from your computer, with the Atlas connection string, add the
   trails and the admin account (the command is safe to repeat):

   ```bash
   MONGODB_URI="<atlas connection string>" ADMIN_EMAIL="<email>" ADMIN_PASSWORD="<password>" npm run setup:production -w server
   ```

5. **Keep it awake**: the free plan stops the service after 15 minutes without
   requests. A free monitor (for example UptimeRobot) that calls
   `/api/health` every 5 minutes avoids the slow first load.

| Variable                                | Required | Notes                                          |
| --------------------------------------- | -------- | ---------------------------------------------- |
| `NODE_ENV`                              | yes      | `production` (set by `render.yaml`)            |
| `MONGODB_URI`                           | yes      | Atlas connection string                        |
| `JWT_SECRET`                            | yes      | long random string                             |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | yes      | key pair for Web Push                          |
| `VAPID_SUBJECT`                         | no       | `mailto:` address of the maintainers           |
| `GEMINI_API_KEY`                        | no       | without it the closest free trail is suggested |

In production the server stops at startup, with a message, if a required
variable is missing. Report photos are stored in the database, so nothing is
written to disk.

## How we work

- `main` must always be working: no direct commits
- one branch per task: `feature/<task-number>-<description>`
- every merge goes through a pull request approved by the other person
