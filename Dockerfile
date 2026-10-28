FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173

COPY package.json server.mjs app.js index.html manifest.webmanifest sw.js icon.svg icon-192.png icon-512.png ./

EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

USER node
CMD ["npm", "start"]
