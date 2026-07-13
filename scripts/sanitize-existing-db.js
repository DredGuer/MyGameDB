#!/usr/bin/env node
// Script à usage unique : migre une base SQLite issue de l'ancienne version
// front-end (localStorage) vers le nouveau backend.
//
// Ce qu'il fait :
//   1. Ouvre le fichier SQLite source fourni en argument.
//   2. Extrait toute valeur `llm_api_key_<provider>` trouvée dans `llm_settings`
//      et l'écrit dans le fichier .env de la racine du projet (jamais commité).
//   3. Supprime ces colonnes/valeurs de la base — le nouveau schéma serveur ne
//      stocke plus jamais de clé API en SQLite.
//   4. Copie le fichier nettoyé vers bdd/collection.sqlite (nom stable attendu
//      par le backend), sans toucher au fichier source original.
//
// Usage :
//   node scripts/sanitize-existing-db.js bdd/ma_collection_jeux-2_Lasted.sqlite

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const PROVIDER_ENV_KEYS = {
    gemini: 'LLM_API_KEY_GEMINI',
    claude: 'LLM_API_KEY_CLAUDE',
    openai: 'LLM_API_KEY_OPENAI',
    mistral: 'LLM_API_KEY_MISTRAL'
};

function main() {
    const sourceArg = process.argv[2];
    if (!sourceArg) {
        console.error('Usage: node scripts/sanitize-existing-db.js <chemin-vers-source.sqlite>');
        process.exit(1);
    }

    const projectRoot = path.resolve(__dirname, '..');
    const sourcePath = path.resolve(projectRoot, sourceArg);
    const targetPath = path.join(projectRoot, 'bdd', 'collection.sqlite');
    const envPath = path.join(projectRoot, '.env');

    if (!fs.existsSync(sourcePath)) {
        console.error(`Fichier source introuvable : ${sourcePath}`);
        process.exit(1);
    }

    fs.copyFileSync(sourcePath, targetPath);
    console.log(`Copié : ${sourcePath} → ${targetPath}`);

    const db = new Database(targetPath);

    const tableExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='llm_settings'"
    ).get();

    const extractedKeys = {};

    if (tableExists) {
        const rows = db.prepare("SELECT key, value FROM llm_settings WHERE key LIKE 'llm_api_key_%'").all();
        rows.forEach(({ key, value }) => {
            const provider = key.replace('llm_api_key_', '');
            const envKey = PROVIDER_ENV_KEYS[provider];
            if (envKey && value) {
                extractedKeys[envKey] = value;
                console.log(`Clé API trouvée pour "${provider}" → sera écrite dans .env (${envKey})`);
            }
        });

        db.prepare("DELETE FROM llm_settings WHERE key LIKE 'llm_api_key_%'").run();
        console.log('Clés API supprimées de la base (llm_settings ne garde que provider/model).');
    } else {
        console.log('Aucune table llm_settings trouvée — rien à nettoyer côté clés API.');
    }

    db.close();

    if (Object.keys(extractedKeys).length > 0) {
        writeEnvKeys(envPath, extractedKeys);
    }

    console.log('\nTerminé. Base prête : bdd/collection.sqlite (fichier source original conservé tel quel).');
}

// Fusionne les clés extraites dans le .env existant (ou le crée à partir de
// .env.example) sans écraser les autres valeurs déjà présentes.
function writeEnvKeys(envPath, keysToWrite) {
    const projectRoot = path.dirname(envPath);
    const examplePath = path.join(projectRoot, '.env.example');

    let lines = [];
    if (fs.existsSync(envPath)) {
        lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    } else if (fs.existsSync(examplePath)) {
        lines = fs.readFileSync(examplePath, 'utf-8').split('\n');
    }

    Object.entries(keysToWrite).forEach(([envKey, value]) => {
        const lineIndex = lines.findIndex(l => l.startsWith(envKey + '='));
        const newLine = `${envKey}=${value}`;
        if (lineIndex !== -1) {
            lines[lineIndex] = newLine;
        } else {
            lines.push(newLine);
        }
    });

    fs.writeFileSync(envPath, lines.join('\n'));
    console.log(`Clés écrites dans ${envPath} (fichier non commité — vérifié via .gitignore).`);
}

main();
