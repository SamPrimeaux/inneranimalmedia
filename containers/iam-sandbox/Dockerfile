FROM node:22-alpine
WORKDIR /app
RUN adduser -D -u 1001 sandbox
COPY server.mjs .
ENV PORT=8080
ENV IAM_IMAGE_TAG=sandbox-v2
EXPOSE 8080
USER sandbox
CMD ["node", "server.mjs"]
