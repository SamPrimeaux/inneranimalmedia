FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache git curl python3 py3-pip bash openssh-client && \
    npm install -g wrangler@latest && \
    adduser -D -u 1001 sandbox
COPY server.mjs .
ENV PORT=8080
ENV IAM_IMAGE_TAG=sandbox-v3
EXPOSE 8080
USER sandbox
CMD ["node", "server.mjs"]
