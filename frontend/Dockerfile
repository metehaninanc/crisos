FROM node:18-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install

COPY . .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM node:18-alpine
WORKDIR /app
RUN npm install --no-save express
COPY --from=build /app/dist /app/dist
COPY server.js /app/server.js
EXPOSE 80

CMD ["node", "server.js"]
