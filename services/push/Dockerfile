FROM --platform=$BUILDPLATFORM golang:1.27.3-trixie AS build
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/cocurdex-push ./cmd/cocurdex-push

FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /out/cocurdex-push /cocurdex-push
EXPOSE 8080
ENTRYPOINT ["/cocurdex-push", "serve"]
