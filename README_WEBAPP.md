# GST Audit Checklist Web App (Frontend + Backend)

Project structure:

- `frontend` - React + Vite application
- `backend` - Express API for Excel upload and export
- `api/index.js` - Vercel serverless bridge to backend app

## 1) Install dependencies

From project root:

```bat
npm install
```

Then install app dependencies:

```bat
npm install --prefix frontend
npm install --prefix backend
```

## 2) Run locally

From project root:

```bat
npm run dev
```

This starts:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000`

## 3) Build for production

From project root:

```bat
npm run build
```

## 4) Deploy on Vercel

This repo is configured with:

- `vercel.json` for frontend build output + rewrites
- `api/index.js` for API entry

Routes after deploy:

- Frontend app at `/`
- API at:
  - `/api/health`
  - `/api/checklist/upload`
  - `/api/checklist/export`
