# SnapTunes: A cross-device co-located music production application for novice music-makers

## Context
WIP

## Setup Instructions
1. Clone the repository
2. Open a terminal in split view (two terminals)
3. Install dependencies in both `client` and `server` folders
   - `cd client && npm i` and `cd server && npm i`
4. Start the backend server (`npm start` in the `server` folder)
5. Start the frontend client (`npm run dev` in the `client` folder)
6. In the client terminal, you should find a link next to `Network` that looks like `https://{your.local.ip.address}:5173/`
7. On your device (a tablet, for example), open a web page with this link. You should see a "Your connection is not private" warning page. Click the "ADVANCED" button, then "Proceed to {client link} (unsafe)".
8. Open another web tab, connect to the same link but replace `5173` with `4000`, and repeat the same steps for the warning page that pops up.
9. Go back to the client tab and enjoy SnapTunes! (Repeat steps 7 and 8 for every device you want to use SnapTunes with.)
10. You can activate/deactivate debug overlays by switching boolean values in [debugHandler.ts](client\src\app\debugHandler.ts).

## Tech Stack
- **Frontend:** React (Vite)
- **Backend:** Express.js (Node.js)
- **Communication:** Socket.IO (WebSockets)

## WIP