// Portage serveur de buildInventoryMarkdown() (ancien frontend). Réutilisé à la
// fois pour l'endpoint d'export .md et comme payload envoyé au LLM.
const db = require('../db/connection');

function buildInventoryMarkdown() {
    const families = db.prepare('SELECT id, name FROM families ORDER BY name ASC').all();
    if (families.length === 0) return null;

    let md = '# 🎮 Mon Inventaire de Jeux Vidéo\n\n';
    md += "_Légende Média : 🎨 = jaquette disponible, 🖼️x N = nombre de screenshots. Les images elles-mêmes ne sont pas incluses ici._\n";

    families.forEach((family) => {
        md += `\n## 📁 Famille : ${family.name}\n`;
        const consoles = db.prepare('SELECT id, name FROM consoles WHERE family_id = ? ORDER BY name ASC').all(family.id);

        if (consoles.length === 0) {
            md += '_Aucune console enregistrée dans cette famille._\n';
        }

        consoles.forEach((console_) => {
            md += `\n### 🕹️ ${console_.name}\n`;

            const games = db.prepare(`
                SELECT g.title, g.hours, g.completed, g.platform_type, g.rating, g.notes,
                       (CASE WHEN g.cover_front IS NOT NULL OR g.cover_back IS NOT NULL THEN 1 ELSE 0 END) as has_cover,
                       (SELECT COUNT(*) FROM screenshots s WHERE s.game_id = g.id) as screenshot_count,
                       (SELECT GROUP_CONCAT(gn.name, ', ') FROM game_genres gg2 JOIN genres gn ON gn.id = gg2.genre_id WHERE gg2.game_id = g.id) as genre_names
                FROM games g WHERE g.console_id = ? ORDER BY g.title ASC
            `).all(console_.id);

            if (games.length === 0) {
                md += '_Aucun jeu enregistré sur cette console._\n';
            } else {
                md += '| Jeu | Styles | Support | Heures | Note | Terminé ? | Média | Notes |\n';
                md += '| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |\n';
                games.forEach((g) => {
                    const status = g.completed ? '✅ Oui' : '❌ Non (En cours)';
                    const ratingStr = (g.rating !== null && g.rating !== undefined) ? `${g.rating}/10` : '—';
                    const notesStr = g.notes ? String(g.notes).replace(/\|/g, '/').replace(/\n/g, ' ') : '';
                    const mediaStr = `${g.has_cover ? '🎨' : ''}${g.screenshot_count > 0 ? ` 🖼️x${g.screenshot_count}` : ''}`.trim() || '—';
                    const stylesStr = g.genre_names || '—';
                    md += `| ${g.title} | ${stylesStr} | ${g.platform_type} | ${g.hours}h | ${ratingStr} | ${status} | ${mediaStr} | ${notesStr} |\n`;
                });
            }
        });
    });

    return md;
}

module.exports = { buildInventoryMarkdown };
