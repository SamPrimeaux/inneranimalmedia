FROM node:22-alpine
WORKDIR /app
COPY server.mjs .
ENV PORT=8080
ENV IAM_RENDER_IMAGE_TAG=v1-stub
EXPOSE 8080
CMD ["node", "server.mjs"]
