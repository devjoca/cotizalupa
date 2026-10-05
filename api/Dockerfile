FROM golang:1.27.1-alpine AS go
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/cotizalupa ./cmd/cotizalupa

FROM alpine:3.22
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=go /out/cotizalupa ./cotizalupa
EXPOSE 3000
CMD ["./cotizalupa"]
