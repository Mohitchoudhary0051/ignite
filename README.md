# OmniDrop prototype

OmniDrop now has a real local-network transfer path. The Node server serves the page and brokers short-lived room signaling; file content is sent browser-to-browser over a WebRTC data channel. The server does not receive file chunks or write transfers to disk.

## Live app

[Open OmniDrop on Vercel](https://ignite-theta-murex.vercel.app/)

## Project workflow

See [Project workflow and data flow](docs/PROJECT_WORKFLOW.md) for Mermaid flowcharts, sender/receiver sequence diagrams, data handling, security boundaries, and current transfer limits.

## Run on one computer

Requirements: Node.js 20 or newer. There are no npm dependencies. The app shell is installable and cached for offline opening after its first secure visit.

```sh
npm start
```

For local backend development, open <http://localhost:4173> in two browser tabs. In one tab, choose a file and create a handoff. In the other, open **Receive**, enter the pairing code, compare the words, then accept. Files up to 50 MB are supported in this MVP. A SHA-256 check runs before the receiver can save the file.

## Install as an app

Serve OmniDrop from a trusted HTTPS address (or use localhost on the same computer), then open it in the browser and choose **Install app**. The installed PWA opens in a standalone window on supported desktop browsers and Android. On iPhone/iPad, open the HTTPS address in Safari, tap **Share**, then **Add to Home Screen**. On browsers without an install prompt, use the browser menu's install or add-to-home-screen action.

The app shell is cached after the first successful load and can reopen offline. Nearby file transfers still need the signaling server running and both devices on the same LAN. Offline QR transfers need no network after both app pages are loaded, and support files up to 1 KB.

## Backend service

`server.mjs` serves the app and runs the WebSocket signaling service. It keeps temporary pairing rooms in memory, expires/revokes them, applies per-IP signaling limits, caps concurrent connections and active rooms, and pings idle WebSocket clients. File bytes stay in the browsers and are never uploaded to the backend. This is a single-instance service; room state is not shared between replicas.

Run the backend in a container:

```sh
docker build -t omnidrop .
docker run --rm -p 4173:4173 omnidrop
```

For a public HTTPS deployment, terminate TLS at a trusted reverse proxy that supports WebSocket upgrades on `/signal`. Set `TRUST_PROXY=true` only when that proxy overwrites `X-Forwarded-For`; otherwise all users behind a proxy may share one rate-limit bucket. Keep one backend instance until room signaling is moved to a shared broker. Configure `OMNIDROP_TLS_CERT` and `OMNIDROP_TLS_KEY` only when Node itself terminates TLS; both must be set together.

Vercel is configured to build the root `Dockerfile` with its Container runtime. Room state is still held in process memory, so use one instance for the prototype; add a shared Redis-backed signaling store before scaling to multiple instances.

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
