FROM node:18.15.0-alpine3.17
COPY . .
RUN npm install
CMD ["npm", "start"]
