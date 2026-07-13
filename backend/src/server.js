require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const { initDb } = require('../../scripts/init-db');
const { errorHandler } = require('./middleware/errorHandler');
const hub = require('./ws/hub');
const steamScheduler = require('./services/steam/steamScheduler');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../bdd/collection.sqlite');
const UPLOADS_PATH = process.env.UPLOADS_PATH || path.join(__dirname, '../../storage/uploads');
const FRONTEND_PATH = path.join(__dirname, '../../frontend');

initDb(DB_PATH);

const app = express();
app.use(express.json());

// Identifie le client à l'origine d'une requête mutante, pour que le hub
// WebSocket permette à ce même client de s'auto-ignorer sur l'événement broadcasté.
app.use((req, res, next) => {
    req.clientId = req.header('X-Client-Id') || crypto.randomUUID();
    next();
});

app.use('/uploads', express.static(UPLOADS_PATH));
app.use(express.static(FRONTEND_PATH));

const familiesRoutes = require('./routes/families.routes');
const consolesRoutes = require('./routes/consoles.routes');
const gamesRoutes = require('./routes/games.routes');
const gamePlatformsRoutes = require('./routes/gamePlatforms.routes');
const genresRoutes = require('./routes/genres.routes');
const { gameGenresRouter } = require('./routes/genres.routes');
const screenshotsRoutes = require('./routes/screenshots.routes');
const { singleRouter: singleScreenshotRoutes } = require('./routes/screenshots.routes');
const coversRoutes = require('./routes/covers.routes');
const settingsRoutes = require('./routes/settings.routes');
const llmSettingsRoutes = require('./routes/llmSettings.routes');
const recommendationsRoutes = require('./routes/recommendations.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const backupRoutes = require('./routes/backup.routes');
const steamRoutes = require('./routes/steam.routes');

app.use('/api/families', familiesRoutes);
app.use('/api/consoles', consolesRoutes);
// Routes imbriquées sous /api/games/:gameId/... montées AVANT /api/games lui-même :
// Express matche dans l'ordre de déclaration, donc /api/games/:id (PUT/DELETE)
// intercepterait sinon /api/games/5/genres, /api/games/5/covers, etc.
app.use('/api/games/:gameId/genres', gameGenresRouter);
app.use('/api/games/:gameId/screenshots', screenshotsRoutes);
app.use('/api/games/:gameId/covers', coversRoutes);
app.use('/api/games/:gameId/platforms', gamePlatformsRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/genres', genresRoutes);
app.use('/api/screenshots', singleScreenshotRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/llm-settings', llmSettingsRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/steam', steamRoutes);

app.get('/api/health', (req, res) => res.json({ data: { status: 'ok' } }));

app.use(errorHandler);

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
hub.attach(wss);

server.listen(PORT, () => {
    console.log(`MyGameDB backend démarré sur http://localhost:${PORT}`);
    console.log(`WebSocket disponible sur ws://localhost:${PORT}/ws`);
});

// Non bloquant : no-op silencieux si STEAM_API_KEY/STEAM_ID absents.
steamScheduler.start();
