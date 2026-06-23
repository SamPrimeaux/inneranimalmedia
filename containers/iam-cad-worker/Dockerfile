# IAM CAD worker — headless OpenSCAD / Blender / FreeCAD on Ubuntu (CF Container standard-2+).
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PORT=8080
ENV IAM_IMAGE_TAG=cad-v1
ENV QT_QPA_PLATFORM=offscreen
ENV HOME=/tmp

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    python3 \
    python3-pip \
    openscad \
    blender \
    freecad \
    freecad-python3 \
    xvfb \
    libxcb-cursor0 \
  && rm -rf /var/lib/apt/lists/*

# Headless wrapper — Ubuntu apt puts freecadcmd at /usr/lib/freecad/bin/freecadcmd-python3
RUN FC_BIN="$(command -v freecadcmd-python3 || echo /usr/lib/freecad/bin/freecadcmd-python3)" \
  && tee /usr/local/bin/FreeCADCmd >/dev/null <<WRAP
#!/usr/bin/env bash
export QT_QPA_PLATFORM="\${QT_QPA_PLATFORM:-offscreen}"
export QT_LOGGING_RULES="\${QT_LOGGING_RULES:-*=false}"
FC_BIN="$FC_BIN"
if command -v xvfb-run >/dev/null 2>&1; then
  exec xvfb-run -a -s "-screen 0 1280x720x24 +extension GLX" env QT_QPA_PLATFORM="\$QT_QPA_PLATFORM" "\$FC_BIN" "\$@"
fi
exec env QT_QPA_PLATFORM="\$QT_QPA_PLATFORM" "\$FC_BIN" "\$@"
WRAP
RUN chmod 755 /usr/local/bin/FreeCADCmd \
  && ln -sf /usr/local/bin/FreeCADCmd /usr/local/bin/freecadcmd

# Node 22 for pipeline runner + optional GLB polish
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY containers/iam-cad-worker/package.json ./package.json
RUN npm install --omit=dev

COPY containers/iam-cad-worker/server.mjs ./server.mjs
COPY containers/iam-cad-worker/run-pipeline.mjs ./run-pipeline.mjs
COPY scripts/designstudio/run-openscad.sh ./scripts/designstudio/run-openscad.sh
COPY scripts/designstudio/run-freecad.sh ./scripts/designstudio/run-freecad.sh
COPY scripts/designstudio/lib.sh ./scripts/designstudio/lib.sh
COPY scripts/designstudio/stl-to-glb.py ./scripts/designstudio/stl-to-glb.py
COPY scripts/lib/glb-optimize.mjs ./scripts/lib/glb-optimize.mjs

RUN chmod +x ./scripts/designstudio/*.sh \
  && useradd -m -u 1001 cadworker \
  && chown -R cadworker:cadworker /app

USER cadworker
EXPOSE 8080
CMD ["node", "server.mjs"]
