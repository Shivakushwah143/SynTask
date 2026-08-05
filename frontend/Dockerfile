# Frontend Docker image for both dev and prod targets.
FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

FROM base AS dev
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

FROM base AS build
ARG VITE_API_URL=/api/v1
ARG VITE_LOGIN_URL=/login
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_LOGIN_URL=${VITE_LOGIN_URL}
RUN npm run build

FROM nginx:1.27-alpine AS prod

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
