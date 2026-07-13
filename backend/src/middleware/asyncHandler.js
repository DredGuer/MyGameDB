// Enveloppe un handler Express async pour transmettre automatiquement toute
// exception (rejet de Promise) au middleware d'erreur, sans try/catch répété
// dans chaque route.
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

module.exports = asyncHandler;
