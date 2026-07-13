// Catalogue standard de familles + consoles (physiques et numériques),
// utilisé par scripts/init-db.js pour peupler une base tout juste créée
// (aucune famille existante). Une base ayant déjà ses propres familles,
// même partiellement, n'est jamais touchée par ce catalogue.
const DEFAULT_CATALOG = {
    'Sony': ['PlayStation', 'PlayStation 2', 'PlayStation 3', 'PlayStation 4', 'PlayStation 5', 'PSP', 'PS Vita'],
    'Nintendo': [
        'NES', 'SNES', 'Nintendo 64', 'GameCube', 'Wii', 'Wii U', 'Switch', 'Switch 2',
        'Game Boy', 'Game Boy Color', 'Game Boy Advance', 'DS', '3DS'
    ],
    'Microsoft': ['Xbox', 'Xbox 360', 'Xbox One', 'Xbox Series X/S'],
    'SEGA': ['Master System', 'Mega Drive', 'Game Gear', 'Saturn', 'Dreamcast'],
    'Atari': ['Atari 2600', 'Atari 7800', 'Atari Lynx', 'Atari Jaguar'],
    'NEC': ['PC Engine'],
    'Autres': ['3DO', 'Neo Geo', 'Amstrad CPC', 'Amiga'],
    'PC': ['Steam', 'Epic Games Store', 'GOG', 'Battle.net', 'Ubisoft Connect', 'EA App', 'PC (autre/physique)'],
    'Mobile': ['Android', 'iOS'],
    'Web': ['Navigateur']
};

module.exports = { DEFAULT_CATALOG };
