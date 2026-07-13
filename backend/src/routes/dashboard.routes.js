const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/connection');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../../bdd/collection.sqlite');

router.get('/stats', asyncHandler(async (req, res) => {
    const totalHours = db.prepare('SELECT COALESCE(SUM(hours),0) as v FROM game_platforms').get().v;
    const totalGames = db.prepare('SELECT COUNT(*) as v FROM games').get().v;
    const completedCount = db.prepare('SELECT COUNT(DISTINCT game_id) as v FROM game_platforms WHERE completed=1').get().v;
    const topGame = db.prepare(`
        SELECT g.title, SUM(gp.hours) as hours
        FROM games g JOIN game_platforms gp ON gp.game_id = g.id
        GROUP BY g.id ORDER BY hours DESC LIMIT 1
    `).get() || null;

    // "En ce moment" : dernière instance touchée (ajoutée ou complétée),
    // toutes plateformes confondues — sert de repère rapide "qu'est-ce que
    // j'ai fait en dernier ?" sans avoir à parcourir toutes les consoles.
    const recentActivity = db.prepare(`
        SELECT g.title, c.name as console_name, gp.completed,
               COALESCE(gp.date_completed, gp.date_added) as activity_date
        FROM game_platforms gp
        JOIN games g ON g.id = gp.game_id
        JOIN consoles c ON c.id = gp.console_id
        ORDER BY activity_date DESC, gp.id DESC LIMIT 1
    `).get() || null;

    let dbSizeBytes = 0;
    try { dbSizeBytes = fs.statSync(DB_PATH).size; } catch (e) { /* fichier pas encore créé */ }

    res.json({
        data: {
            totalHours,
            totalGames,
            completedCount,
            completionPct: totalGames > 0 ? Math.round((completedCount / totalGames) * 100) : 0,
            topGame,
            recentActivity,
            dbSizeBytes
        }
    });
}));

router.get('/breakdown/families', asyncHandler(async (req, res) => {
    const rows = db.prepare(`
        SELECT f.name, COALESCE(SUM(gp.hours),0) as hours
        FROM families f
        LEFT JOIN consoles c ON c.family_id = f.id
        LEFT JOIN game_platforms gp ON gp.console_id = c.id
        GROUP BY f.id ORDER BY hours DESC
    `).all();
    res.json({ data: rows });
}));

router.get('/breakdown/genres', asyncHandler(async (req, res) => {
    const rows = db.prepare(`
        SELECT g.name, COUNT(DISTINCT gg.game_id) as game_count, COALESCE(SUM(gp.hours),0) as total_hours
        FROM genres g
        LEFT JOIN game_genres gg ON gg.genre_id = g.id
        LEFT JOIN game_platforms gp ON gp.game_id = gg.game_id
        GROUP BY g.id
        HAVING game_count > 0
        ORDER BY total_hours DESC
    `).all();
    res.json({ data: rows });
}));

// Analyse "styles de jeu par tranche d'âge" — portage direct de
// computeAgeGenreStats() (frontend), adapté au modèle multi-plateforme :
// on itère par INSTANCE (game_platforms), pas par jeu, car chaque instance a
// sa propre date de référence. Référence de date par instance, par priorité :
// 1. date de possession de l'instance, 2. fallback console, 3. fallback date_added.
// Un jeu multi-plateforme peut donc contribuer à plusieurs tranches d'âge si
// ses instances ont des dates de référence différentes — comportement voulu.
router.get('/age-genre-analysis', asyncHandler(async (req, res) => {
    const birthdateRow = db.prepare("SELECT value FROM app_settings WHERE key='birthdate'").get();
    if (!birthdateRow || !birthdateRow.value) {
        return res.json({ data: null });
    }
    const birth = new Date(birthdateRow.value + 'T00:00:00');
    if (isNaN(birth.getTime())) return res.json({ data: null });

    const instances = db.prepare('SELECT id, game_id, hours, console_id, date_added FROM game_platforms').all();
    if (instances.length === 0) return res.json({ data: null });

    const genreLinks = db.prepare('SELECT gg.game_id, g.name FROM game_genres gg JOIN genres g ON g.id = gg.genre_id').all();
    const gameGenreNames = {};
    genreLinks.forEach(({ game_id, name }) => {
        (gameGenreNames[game_id] ||= []).push(name);
    });

    const instanceEarliest = {};
    db.prepare("SELECT game_platform_id, MIN(date_start) as d FROM game_platform_ownership_periods WHERE date_start IS NOT NULL GROUP BY game_platform_id").all()
        .forEach(({ game_platform_id, d }) => { instanceEarliest[game_platform_id] = d; });

    const consoleEarliest = {};
    db.prepare("SELECT console_id, MIN(date_start) as d FROM console_ownership_periods WHERE date_start IS NOT NULL GROUP BY console_id").all()
        .forEach(({ console_id, d }) => { consoleEarliest[console_id] = d; });

    const buckets = {};
    let excludedCount = 0;
    let estimatedCount = 0;

    instances.forEach(({ id: platformInstanceId, game_id: gameId, hours, console_id, date_added }) => {
        let refDate = instanceEarliest[platformInstanceId];
        let estimated = false;
        if (!refDate) { refDate = consoleEarliest[console_id]; estimated = true; }
        if (!refDate) { refDate = date_added; estimated = true; }
        if (!refDate) return;

        const ref = new Date(refDate + 'T00:00:00');
        if (isNaN(ref.getTime())) return;

        let age = ref.getFullYear() - birth.getFullYear();
        const beforeBirthdayThisYear = (ref.getMonth() < birth.getMonth()) ||
            (ref.getMonth() === birth.getMonth() && ref.getDate() < birth.getDate());
        if (beforeBirthdayThisYear) age -= 1;

        if (age < 0) { excludedCount++; return; }
        if (estimated) estimatedCount++;

        const bucketStart = Math.floor(age / 5) * 5;
        const label = `${bucketStart}-${bucketStart + 4} ans`;
        if (!buckets[label]) buckets[label] = { start: bucketStart, totalHours: 0, genres: {} };
        buckets[label].totalHours += hours;

        const genresForGame = (gameGenreNames[gameId] && gameGenreNames[gameId].length) ? gameGenreNames[gameId] : ['Non taggé'];
        genresForGame.forEach((gname) => {
            buckets[label].genres[gname] = (buckets[label].genres[gname] || 0) + hours;
        });
    });

    res.json({ data: { buckets, excludedCount, estimatedCount } });
}));

module.exports = router;
