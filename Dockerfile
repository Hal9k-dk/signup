# syntax=docker/dockerfile:1
FROM golang:1-bookworm AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends xorriso \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY . .
RUN make build

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /src/bin/hal9k-signup /hal9k-signup
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/hal9k-signup"]
