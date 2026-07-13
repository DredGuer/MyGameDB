# node:22-bookworm-slim (glibc) plutôt qu'alpine : better-sqlite3 compile un
# binding natif au moment de l'install, et les binaires prébuild de la lib
# ciblent glibc — alpine (musl) demanderait des paquets de build supplémentaires
# et une compilation depuis les sources, plus lente et plus fragile.
FROM node:22-bookworm-slim

WORKDIR /app

# Étape dépendances (couche cachée séparément du code applicatif)
COPY package.json ./
COPY backend/package.json ./backend/
RUN npm install --omit=dev --workspaces

# Code applicatif
COPY backend ./backend
COPY frontend ./frontend
COPY scripts ./scripts

EXPOSE 3000

CMD ["node", "backend/src/server.js"]
