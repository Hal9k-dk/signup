# syntax=docker/dockerfile:1
# Go compilation never sees the multi-gigabyte static collection.
FROM golang:1-bookworm AS tools
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY api/ api/
COPY internal/ internal/
COPY cmd/server/*.go cmd/server/
COPY cmd/package/*.go cmd/package/
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -o /out/hal9k-signup ./cmd/server \
    && CGO_ENABLED=0 go build -trimpath -o /out/package ./cmd/package

# Immutable media has its own cache chain: frontend/Go edits do not copy it
# into the compiler or regenerate it. Selection still follows published.json.
FROM scratch AS media
WORKDIR /src
COPY experiences/windows98/public/images/published.json experiences/windows98/public/images/published.json
COPY experiences/windows98/public/publishing/ experiences/windows98/public/publishing/
COPY experiences/windows98/public/cds/ experiences/windows98/public/cds/
COPY --from=tools /out/package /package
# No shell in scratch; the packager is a static Go executable.
RUN ["/package", "-mode", "media", "-out", "/out/media"]

FROM tools AS web
RUN apt-get update \
    && apt-get install -y --no-install-recommends xorriso \
    && rm -rf /var/lib/apt/lists/*
COPY experiences.json ./
COPY landing/public/ landing/public/
COPY shared/ shared/
COPY experiences/physics/public/ experiences/physics/public/
COPY experiences/frontpage98/public/ experiences/frontpage98/public/
COPY experiences/survey/public/ experiences/survey/public/
COPY experiences/terminal/public/ experiences/terminal/public/
COPY experiences/windows98/public/*.js experiences/windows98/public/*.html experiences/windows98/public/*.css experiences/windows98/public/*.bin experiences/windows98/public/
COPY experiences/windows98/public/vendor/ experiences/windows98/public/vendor/
COPY experiences/windows98/public/images/published.json experiences/windows98/public/images/published.json
COPY experiences/windows98/test-cd/ experiences/windows98/test-cd/
# Validation reads selected manifest/state from the media stage without copying
# the collection into this frontend layer (supported by Podman and BuildKit).
RUN --mount=type=bind,from=media,source=/out/media/experiences/windows98/publishing,target=/src/experiences/windows98/public/publishing \
    mkdir -p experiences/windows98/public/downloads \
    && xorriso -as mkisofs -V HAL9K_TEST -o experiences/windows98/public/downloads/hal9k-test.iso experiences/windows98/test-cd \
    && /out/package -mode web -out /out/web

FROM scratch
COPY --from=web /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
# Large, stable layer before the small, frequently changing frontend/server.
COPY --from=media /out/media/ /assets/
COPY --from=web /out/web/ /assets/
COPY --from=tools /out/hal9k-signup /hal9k-signup
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/hal9k-signup"]
