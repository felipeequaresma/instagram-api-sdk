FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
# The demo (examples/mini-api.js) imports express, which is a devDependency, so
# reuse the fully-installed, lockfile-pinned node_modules from the deps stage
# instead of `npm ci --omit=dev` (which would drop express).
COPY --from=deps /app/node_modules ./node_modules

COPY --from=build /app/dist ./dist
COPY --from=build /app/examples/mini-api.js ./examples/mini-api.js

EXPOSE 3000
CMD ["node", "examples/mini-api.js"]
