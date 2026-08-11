// Normalisation du volet financier des périodes de possession (prix d'achat/
// vente, interlocuteur + son type, notes libres). Partagé par les périodes
// console (consoles.routes.js) et les périodes jeu+plateforme
// (gamePlatforms.routes.js) pour que les deux se comportent exactement pareil.

// Types d'interlocuteur acceptés, côté achat comme côté vente. Une valeur
// inconnue est ramenée à NULL plutôt que rejetée : ces champs sont purement
// descriptifs, une saisie exotique ne doit jamais faire échouer un
// enregistrement de période.
const COUNTERPARTY_TYPES = ['personne', 'grande_surface', 'magasin_specialise', 'autre'];

// Colonnes financières, dans l'ordre utilisé par les INSERT/UPDATE.
const FINANCIAL_FIELDS = [
    'purchase_price', 'purchase_from', 'purchase_from_type',
    'sale_price', 'sale_to', 'sale_to_type', 'purchase_notes'
];

// Un prix vide/absent vaut NULL (« non renseigné »), ce qui est différent de 0
// (« obtenu gratuitement ») : on garde donc 0 tel quel. Un texte non numérique
// ou un montant négatif retombe sur NULL.
function parsePrice(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
}

function parseText(value) {
    if (typeof value !== 'string') return null;
    return value.trim() || null;
}

function parseCounterpartyType(value) {
    return COUNTERPARTY_TYPES.includes(value) ? value : null;
}

// Extrait du corps de requête les seuls champs financiers, normalisés.
function extractFinancials(body = {}) {
    return {
        purchase_price: parsePrice(body.purchase_price),
        purchase_from: parseText(body.purchase_from),
        purchase_from_type: parseCounterpartyType(body.purchase_from_type),
        sale_price: parsePrice(body.sale_price),
        sale_to: parseText(body.sale_to),
        sale_to_type: parseCounterpartyType(body.sale_to_type),
        purchase_notes: parseText(body.purchase_notes)
    };
}

// Valeurs prêtes à être passées en paramètres liés, dans l'ordre de
// FINANCIAL_FIELDS.
function financialValues(financials) {
    return FINANCIAL_FIELDS.map((f) => financials[f]);
}

module.exports = { COUNTERPARTY_TYPES, FINANCIAL_FIELDS, extractFinancials, financialValues };
