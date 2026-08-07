# SnapTunes: A cross-device co-located music production application for novice music-makers

## Context
SnapTunes is a cross-device, co-located music production application designed for novice music-makers. It explores collaborative composition through physical device interactions: snapping devices together to merge musical elements, syncing playback and tempo across a group, and using gestures such as tilt and shake to control the composition in real time.

The project is built on the SimSnap framework and developed as part of a research at the Synaesthetic Media Lab (SynLab), Toronto Metropolitan University. It investigates how tangible, cross-device interaction can lower the barrier to entry for group music-making, letting users without a musical background create together using simple, physical gestures rather than a traditional DAW interface.

## Setup Instructions
1. Clone the repository
2. Open a terminal in split view (two terminals)
3. Install dependencies in both `client` and `server` folders
   - `cd client && npm i` and `cd server && npm i`
4. Start the backend server (`npm start` in the `server` folder)
5. Start the frontend client (`npm run dev` in the `client` folder)

⚠️ Make sure that you are connected on the same wifi hotspot for all devices involved (laptop, tablets, etc.)

6. In the client terminal, you should find a link next to `Network` that looks like `https://{your.local.ip.address}:5173/`. You can also find your IP address by opening a new terminal, entering `ipconfig`, and searching for the line `IPv4 Address:`, this is your local IP address. (On macOS/Linux, use `ifconfig` or `ip addr` instead.)
7. On your device (a tablet, for example), open a web page with this link. You should see a "Your connection is not private" warning page. Click the "ADVANCED" button, then "Proceed to {client link} (unsafe)".
8. Open another web tab, connect to the same link but replace `5173` with `4000`, and repeat the same steps for the warning page that pops up.

⚠️ If you have a blank page or a loading page (for more than a minute), you might need to check if the wifi you're connected to is allowing the server to be exposed on the network.

9. Go back to the client tab and enjoy SnapTunes! (Repeat steps 7 and 8 for every device you want to use SnapTunes with.)
10. You can activate/deactivate debug overlays by switching boolean values in [debugHandler.ts](client/src/app/debugHandler.ts).

## Tech Stack
- **Frontend:** React (Vite) 
   - **Audio library** Tone.js
- **Backend:** Express.js (Node.js)
- **Communication:** Socket.IO (WebSockets)

## Note for devs
You'll need to restart the server (npm start) every time you want to see the modifications you've just made under the /server folder.

### Future Direction

**Bump gesture to trigger overlay mode.** This interaction is meant to let a user temporarily and transparently borrow someone else's composition for inspiration, without disrupting their own. The original concept was to hover one device over another's to retrieve a live preview of the foreign composition, but this proved difficult to implement. The idea evolved into a bump interaction instead: bringing one device into contact with another. Using each device's accelerometer, it should be theoretically possible to detect a simultaneous but opposite-direction impact on both devices (the device on top receives a shock from above, the one underneath receives it from below). The device bumping from above would be the one that receives the preview of the composition belonging to the device underneath.

**Sound effects (SFX).** The idea here is to add a UI that lets users apply audio effects to instruments, such as reverb, to modify the sound of the composition in real time. This would strengthen the app's audio expressiveness, which currently offers limited control over how each instrument actually sounds.

**Stopping the composition on undo.** Currently, an undo action does not interrupt ongoing playback, which can create a mismatch between the displayed state and what is actually playing. Automatically stopping the composition on undo would prevent this desync and keep the behavior predictable for users.

**Ghost notes during playback.** When a note is added while the composition is playing, it could appear as a ghost note (visible but not played) and only become a real note once the composition loops back to its starting point. This would allow content to be added without disrupting ongoing playback, while still giving immediate visual feedback on the changes made.


Have fun with this project.
Hugo.