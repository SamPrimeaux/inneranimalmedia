# Build stage
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /iam-sandbox-go .

# Runtime — git/wrangler for agent sandbox lane; optional FUSE for R2
FROM alpine:3.20
RUN apk add --no-cache git curl bash openssh-client ca-certificates fuse3 nodejs npm su-exec \
  && npm install -g wrangler@latest \
  && adduser -D -u 1001 sandbox

# tigrisfs for R2 FUSE (optional at runtime when env creds set)
RUN ARCH=$(uname -m) && \
  if [ "$ARCH" = "x86_64" ]; then ARCH="amd64"; fi && \
  if [ "$ARCH" = "aarch64" ]; then ARCH="arm64"; fi && \
  (curl -fsSL "https://github.com/tigrisdata/tigrisfs/releases/download/v1.2.0/tigrisfs_1.2.0_linux_${ARCH}.tar.gz" \
    | tar -xz -C /usr/local/bin/ 2>/dev/null || true) && \
  chmod +x /usr/local/bin/tigrisfs 2>/dev/null || true

WORKDIR /app
COPY --from=build /iam-sandbox-go /app/iam-sandbox-go
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /mnt/workspace /workspace /tmp/workspace \
  && chown -R sandbox:sandbox /app /mnt/workspace /workspace /tmp/workspace

ENV PORT=8080
ENV IAM_IMAGE_TAG=sandbox-go-v1
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
