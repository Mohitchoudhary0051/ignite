// Vercel's zero-config Node server entry point. Keep listen() here so Vercel
// can bind the server to its managed port. Local development uses server.mjs.
import { server } from './server.mjs';

const port = Number(process.env.PORT || 3000);
server.listen(port);
