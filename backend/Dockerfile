FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY data ./data
EXPOSE 4000
CMD ["node", "src/index.js"]
