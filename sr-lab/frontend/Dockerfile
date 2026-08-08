# Stage 1: build the React app
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY vite.config.js index.html ./
COPY src ./src
RUN npm run build

# Stage 2: serve with nginx, proxying /api to the backend container
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
