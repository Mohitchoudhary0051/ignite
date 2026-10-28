# OmniDrop prototype

OmniDrop now has a real local-network transfer path. The Node server serves the page and brokers short-lived room signaling; file content is sent browser-to-browser over a WebRTC data channel. The server does not receive file chunks or write transfers to disk.

## Run on one computer

Requirements: Node.js 20 or newer. There are no npm dependencies.

```sh
npm start
```

Open <http://localhost:4173> in two browser tabs. In one tab, choose a file and create a handoff. In the other, open **Receive**, enter the pairing code, compare the words, then accept. Files up to 50 MB are supported in this MVP. A SHA-256 check runs before the receiver can save the file.

## Use a phone on the same Wi-Fi

The phone and computer must reach the same host on the LAN. Browsers require a secure origin for the camera and Web Crypto, so use a trusted HTTPS certificate whose subject alternative names include the computer's LAN name/IP. Set `OMNIDROP_TLS_CERT` and `OMNIDROP_TLS_KEY` to that certificate and key before starting the server. Do not bypass browser certificate warnings. If the phone cannot trust the certificate, use localhost testing on the computer instead.

Allow TCP port 4173 only on your private network. This build uses host ICE candidates and no STUN/TURN service; it is intended for devices on the same LAN. Restrictive Wi-Fi client isolation can prevent peers from connecting.

## Current boundaries

- Nearby-network WebRTC is implemented. Offline optical transfer is implemented for encrypted files up to 1 KB using animated QR frames with AES-GCM encryption and SHA-256 verification; Wi-Fi Direct is not available to browser apps.
- Pairing rooms stay in server memory until the selected 10-minute, 1-hour, or 24-hour expiry. The server sees pairing codes, SDP/ICE signaling, and peer network metadata, but not file bytes.
- WebRTC data channels use DTLS encryption. This is an early prototype, not a security-reviewed production service.
- The server has basic per-IP signaling rate limits and one receiver per room. There is no TURN fallback, resume across reloads, multi-file transfer, or persistent transfer history.
- Clearing the OmniDrop session releases in-page data and closes the connection. It cannot remove files the recipient saved, screenshots, or operating-system/browser caches.

## Transfer with no network

Open OmniDrop on both devices over trusted HTTPS while online and keep both pages open. On the sender choose **Air-gap optical**, select a file up to 1 KB, create an 8-character-or-longer passphrase, and share that passphrase in person. On the receiver choose **Receive** and scan the repeating QR frames. The receiver decrypts with AES-GCM and checks SHA-256 before offering Save. Then disable Wi-Fi and mobile data. Camera scanning requires a browser with `BarcodeDetector`; this is a small-file prototype, not a high-speed replacement for Wi-Fi.
