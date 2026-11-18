FROM node:22-alpine AS base

WORKDIR /app

COPY package*.json ./

FROM base AS deps

RUN npm ci

FROM deps AS dev

ENV VITE_API_URL=/api
ENV VITE_DEV_API_TARGET=http://app:8080
ENV VITE_USE_POLLING=true
ENV CHOKIDAR_USEPOLLING=true

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]

FROM deps AS builder

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

COPY . .
RUN npm run build

# Client cabinet = platform root. Comes from the "portal" build context
# (../crm-client): docker compose passes it via additional_contexts, or
#   docker build --build-context portal=../crm-client .
# Only sources are copied, never the host node_modules.
FROM node:22-alpine AS portal-builder

WORKDIR /portal
COPY --from=portal package.json package-lock.json ./
RUN npm ci
COPY --from=portal index.html vite.config.ts tsconfig.json tsconfig.node.json ./
COPY --from=portal public ./public
COPY --from=portal src ./src

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine AS production

COPY nginx/ /etc/nginx/crm/
COPY nginx.conf /etc/nginx/crm/http.conf.template
COPY nginx/00-rate-limits.conf /etc/nginx/conf.d/00-rate-limits.conf
COPY nginx/10-platform-routes.conf /etc/nginx/conf.d/10-platform-routes.conf
COPY nginx/19-configure-crm.sh /docker-entrypoint.d/19-configure-crm.sh
RUN chmod +x /docker-entrypoint.d/19-configure-crm.sh
# One platform: cabinet at /, admin panel at /admin, shared 404 page.
COPY --from=portal-builder /portal/dist /usr/share/nginx/html
COPY --from=portal-builder /portal/dist/index.html /usr/share/nginx/html/404.html
COPY --from=builder /app/dist /usr/share/nginx/html/admin

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
