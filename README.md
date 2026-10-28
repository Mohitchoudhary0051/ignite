# OmniDrop prototype

OmniDrop serves its web app from Vercel and uses a persistent Node WebSocket service on Render for short-lived room signaling. File content travels directly browser-to-browser over a WebRTC data channel; the signaling server never receives file chunks or writes transfers to disk.

## Live app

[Open OmniDrop on Vercel](https://ignite-theta-murex.vercel.app/)

## Project workflow

See [Project workflow and data flow](docs/PROJECT_WORKFLOW.md) for Mermaid flowcharts, sender/receiver sequence diagrams, data handling, security boundaries, and current transfer limits.

## Run on one computer

Requirements: Node.js 20 or newer. There are no npm dependencies. The app shell is installable and cached for offline opening after its first secure visit.

```sh
npm start
```

For local backend development, open <http://localhost:4173/?signal=local> in two browser tabs. The `?signal=local` flag sends signaling to the local Node server. Without that flag, all devices use the shared Render signaling service, including a desktop opened on localhost, so its pairing room is visible to a phone on the deployed app. In one tab, choose a file and create a handoff. In the other, open **Receive**, enter the pairing code, compare the words, then accept. Files up to 50 MB are supported in this MVP. A SHA-256 check runs before the receiver can save the file.

## Install as an app

Serve OmniDrop from a trusted HTTPS address (or use localhost on the same computer), then open it in the browser and choose **Install app**. The installed PWA opens in a standalone window on supported desktop browsers and Android. On iPhone/iPad, open the HTTPS address in Safari, tap **Share**, then **Add to Home Screen**. On browsers without an install prompt, use the browser menu's install or add-to-home-screen action.

The app shell is cached after the first successful load and can reopen offline. Nearby file transfers still need the signaling server running and both devices on the same LAN. Offline QR transfers need no network after both app pages are loaded, and support files up to 1 KB.

## Deploy the signaling backend

The frontend stays on Vercel. Pairing needs the separate Render service because Vercel instances do not share this in-memory signaling room.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FMohitchoudhary0051%2Fignite)

1. Open the [Render dashboard](https://dashboard.render.com/), choose **New → Blueprint**, and connect the `Mohitchoudhary0051/ignite` GitHub repository.
2. Render reads `render.yaml` and creates the `omnidrop-mohitchoudhary0051` Node web service in Singapore. Keep it at one instance.
3. Wait for the Render deployment to become live, then open <https://omnidrop-mohitchoudhary0051.onrender.com/health>. It should return JSON with `"ok":true`.
4. Open the Vercel app on both devices, refresh it, and keep them on the same Wi-Fi. If you use a different Vercel domain, update the Render `ALLOWED_ORIGINS` environment variable to that exact origin.

The Render free service may take about a minute to wake after 15 minutes without traffic. Active pairing connections send WebSocket heartbeats during a transfer.

## Backend service

`server.mjs` serves the app and runs the WebSocket signaling service. It keeps temporary pairing rooms in process memory, expires/revokes them, applies per-IP signaling limits, caps concurrent connections and active rooms, and pings idle WebSocket clients. File bytes stay in the browsers and are never uploaded to the backend. Keep this Render service at one instance because pairing state is held in memory.

Run the backend in a container:

```sh
docker build -t omnidrop .
docker run --rm -p 4173:4173 omnidrop
```

For a public HTTPS deployment, terminate TLS at a trusted reverse proxy that supports WebSocket upgrades on `/signal`. Set `TRUST_PROXY=true` only when that proxy overwrites `X-Forwarded-For`; otherwise all users behind a proxy may share one rate-limit bucket. Keep one backend instance until room signaling is moved to a shared broker. Configure `OMNIDROP_TLS_CERT` and `OMNIDROP_TLS_KEY` only when Node itself terminates TLS; both must be set together.

The root `render.yaml` defines the signaling service in Singapore. Render accepts the WebSocket connections and keeps the room state in one long-lived Node process. The Vercel site connects to `wss://omnidrop-mohitchoudhary0051.onrender.com/signal`.

## Use a phone on the same Wi-Fi

The phone and computer must reach the same host on the LAN. Browsers require a secure origin for the camera and Web Crypto, so use a trusted HTTPS certificate whose subject alternative names include the computer's LAN name/IP. Set `OMNIDROP_TLS_CERT` and `OMNIDROP_TLS_KEY` to that certificate and key before starting the server. Do not bypass browser certificate warnings. If the phone cannot trust the certificate, use localhost testing on the computer instead.

Allow TCP port 4173 only on your private network. WebRTC uses Google's public STUN service to discover direct peer routes; file data still travels directly between devices. There is no TURN relay, so restrictive NATs, firewalls, or Wi-Fi client isolation can still prevent peers from connecting. Keep both devices on the same Wi-Fi for this prototype.

## Current boundaries

- Nearby-network WebRTC is implemented. Offline optical transfer is implemented for encrypted files up to 1 KB using animated QR frames with AES-GCM encryption and SHA-256 verification; Wi-Fi Direct is not available to browser apps.
- Pairing rooms stay in server memory until the selected 10-minute, 1-hour, or 24-hour expiry. The server sees pairing codes, SDP/ICE signaling, and peer network metadata, but not file bytes.
- WebRTC data channels use DTLS encryption. This is an early prototype, not a security-reviewed production service.
- The server has basic per-IP signaling rate limits and one receiver per room. There is no TURN fallback, resume across reloads, multi-file transfer, or Wi-Fi Direct. Recent transfer metadata is stored locally in the browser; file contents are not stored in history.
- Clearing the OmniDrop session releases in-page data and closes the connection. It cannot remove files the recipient saved, screenshots, or operating-system/browser caches.

## Transfer with no network

Open OmniDrop on both devices over trusted HTTPS while online and keep both pages open. On the sender choose **Air-gap optical**, select a file up to 1 KB, create an 8-character-or-longer passphrase, and share that passphrase in person. On the receiver choose **Receive** and scan the repeating QR frames. The receiver decrypts with AES-GCM and checks SHA-256 before offering Save. Then disable Wi-Fi and mobile data. Camera scanning requires a browser with `BarcodeDetector`; this is a small-file prototype, not a high-speed replacement for Wi-Fi.
