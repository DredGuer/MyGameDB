// Portage serveur de buildInventoryMarkdown() (ancien frontend). Réutilisé à la
// fois pour l'endpoint d'export .md et comme payload envoyé au LLM.
//
// Format multi-plateforme : chaque jeu apparaît une seule fois (avec son
// résumé global — styles, note, média, total d'heures) suivi d'un tableau de
// ses instances de possession par plateforme. Les 3 requêtes globales
// ci-dessous (anti N+1, même pattern que /api/genres/by-game) évitent une
// requête préparée par jeu.
const db = require('../db/connection');

function buildInventoryMarkdown() {
    const games = db.prepare(`
        SELECT id, title, rating, notes, cover_front, cover_back
        FROM games ORDER BY title ASC
    `).all();
    if (games.length === 0) return null;

    let md = '# 🎮 Mon Inventaire de Jeux Vidéo\n\n';
    md += "_Légende Média : 🎨 = jaquette disponible, 🖼️x N = nombre de screenshots. Chaque jeu peut être possédé sur plusieurs plateformes ; les heures/statut sont indiqués par plateforme._\n";

    const allInstances = db.prepare(`
        SELECT gp.game_id, gp.hours, gp.completed, gp.platform_type, c.name as console_name, f.name as family_name
        FROM game_platforms gp
        JOIN consoles c ON c.id = gp.console_id
        JOIN families f ON f.id = c.family_id
        ORDER BY f.name ASC, c.name ASC
    `).all();
    const instancesByGame = {};
    allInstances.forEach((i) => { (instancesByGame[i.game_id] ||= []).push(i); });

    const genreRows = db.prepare(`
        SELECT gg.game_id, gn.name FROM game_genres gg JOIN genres gn ON gn.id = gg.genre_id ORDER BY gn.name ASC
    `).all();
    const genresByGame = {};
    genreRows.forEach(({ game_id, name }) => { (genresByGame[game_id] ||= []).push(name); });

    const screenshotCounts = db.prepare(`
        SELECT game_id, COUNT(*) as v FROM screenshots GROUP BY game_id
    `).all();
    const screenshotCountByGame = {};
    screenshotCounts.forEach(({ game_id, v }) => { screenshotCountByGame[game_id] = v; });

    games.forEach((g) => {
        const instances = instancesByGame[g.id] || [];
        const genreNames = (genresByGame[g.id] || []).join(', ') || '—';
        const screenshotCount = screenshotCountByGame[g.id] || 0;
        const hasCover = g.cover_front || g.cover_back ? 1 : 0;
        const mediaStr = `${hasCover ? '🎨' : ''}${screenshotCount > 0 ? ` 🖼️x${screenshotCount}` : ''}`.trim() || '—';
        const ratingStr = (g.rating !== null && g.rating !== undefined) ? `${g.rating}/10` : '—';
        const totalHours = instances.reduce((sum, i) => sum + i.hours, 0);

        md += `\n## 🎮 ${g.title}\n`;
        md += `_Styles : ${genreNames} — Note globale : ${ratingStr} — Média : ${mediaStr} — Total heures (toutes plateformes) : ${totalHours}h_\n\n`;
        if (g.notes) md += `> ${String(g.notes).replace(/\n/g, ' ')}\n\n`;

        if (instances.length === 0) {
            md += '_Aucune plateforme enregistrée pour ce jeu._\n';
        } else {
            md += '| Plateforme | Famille | Support | Heures | Terminé ? |\n';
            md += '| :--- | :--- | :---: | :---: | :---: |\n';
            instances.forEach((i) => {
                const status = i.completed ? '✅ Oui' : '❌ Non (En cours)';
                md += `| ${i.console_name} | ${i.family_name} | ${i.platform_type} | ${i.hours}h | ${status} |\n`;
            });
        }
    });

    return md;
}

module.exports = { buildInventoryMarkdown };
