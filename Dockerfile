# syntax=docker/dockerfile:1
FROM golang:1-bookworm AS build
WORKDIR /src
COPY . .
RUN make build

FROM scratch
COPY --from=build /src/bin/hal9k-signup /hal9k-signup
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/hal9k-signup"]
