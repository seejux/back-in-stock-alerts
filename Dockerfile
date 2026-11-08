FROM node:24-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node","--no-warnings","src/server.js"]
