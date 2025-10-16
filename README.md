# Bowling League (server.js build — no Python needed)

- **server.js**: Express API + serves React build
- **Lowdb** JSON file (`db.json`) for storage (pure JS, no native modules)
- **React (Vite)** client in `/client`

## Run locally
```bash
npm install
npm run build
npm start   # http://localhost:10000
```

## Deploy to Render
- Build: `npm install && npm run build`
- Start: `npm start`