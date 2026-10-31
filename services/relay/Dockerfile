FROM --platform=$BUILDPLATFORM golang:1.27.3-trixie AS build
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/cocurdex-relay ./cmd/cocurdex-relay \
  && mkdir -p /out/data

FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /out/cocurdex-relay /cocurdex-relay
COPY --from=build --chown=65532:65532 /out/data /data
VOLUME ["/data"]
EXPOSE 8080
ENTRYPOINT ["/cocurdex-relay", "serve", "--data-dir", "/data"]
