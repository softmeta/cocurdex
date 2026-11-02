package relay

import (
	"bytes"
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

type SmokeResult struct {
	Version   string
	Protocol  int
	Bridged   bool
	RoundTrip time.Duration
}

func socketBase(baseURL string) (string, error) {
	trimmed := strings.TrimRight(baseURL, "/")
	switch {
	case strings.HasPrefix(trimmed, "https://"):
		return "wss://" + strings.TrimPrefix(trimmed, "https://"), nil
	case strings.HasPrefix(trimmed, "http://"):
		return "ws://" + strings.TrimPrefix(trimmed, "http://"), nil
	}
	return "", fmt.Errorf("relay URL must start with http:// or https://, got %q", baseURL)
}

func smokeRegistration(challenge ChallengeMessage, credential string) (RegisterMessage, error) {
	nonce, err := DecodeBase64URL(challenge.Nonce, NonceLength)
	if err != nil {
		return RegisterMessage{}, fmt.Errorf("challenge nonce: %w", err)
	}
	relayKey, err := DecodeBase64URL(challenge.RelayKey, 32)
	if err != nil {
		return RegisterMessage{}, fmt.Errorf("challenge relay key: %w", err)
	}
	hostKey, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		return RegisterMessage{}, err
	}
	proof, err := ProveHostKey(hostKey, relayKey, nonce)
	if err != nil {
		return RegisterMessage{}, err
	}
	public := hostKey.PublicKey().Bytes()
	return RegisterMessage{
		Type:       "register",
		RouteID:    EncodeBase64URL(RouteIDForHostKey(public)),
		HostKey:    EncodeBase64URL(public),
		Proof:      EncodeBase64URL(proof),
		Credential: credential,
	}, nil
}

func dialChannel(ctx context.Context, url string) (*websocket.Conn, error) {
	conn, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{
		Subprotocols: []string{ChannelSubprotocol},
	})
	if err != nil {
		return nil, err
	}
	conn.SetReadLimit(MaxMessageBytes)
	return conn, nil
}

func echoOnce(ctx context.Context, base string, control *websocket.Conn) error {
	var incoming IncomingMessage
	if err := wsjson.Read(ctx, control, &incoming); err != nil {
		return fmt.Errorf("waiting for the incoming session: %w", err)
	}
	conn, err := dialChannel(ctx, base+"/v1/host/accept/"+incoming.Ticket)
	if err != nil {
		return fmt.Errorf("accepting the session: %w", err)
	}
	defer conn.CloseNow()
	kind, data, err := conn.Read(ctx)
	if err != nil {
		return err
	}
	return conn.Write(ctx, kind, data)
}

func Smoke(ctx context.Context, baseURL, credential string) (SmokeResult, error) {
	base, err := socketBase(baseURL)
	if err != nil {
		return SmokeResult{}, err
	}
	control, _, err := websocket.Dial(ctx, base+"/v1/host", nil)
	if err != nil {
		return SmokeResult{}, fmt.Errorf("connecting as a host: %w", err)
	}
	defer control.CloseNow()
	var challenge ChallengeMessage
	if err := wsjson.Read(ctx, control, &challenge); err != nil {
		return SmokeResult{}, fmt.Errorf("reading the challenge: %w", err)
	}
	result := SmokeResult{Version: challenge.Version, Protocol: challenge.Protocol}
	if challenge.Protocol < WireProtocol {
		return result, fmt.Errorf("the relay speaks protocol %d, want %d", challenge.Protocol, WireProtocol)
	}
	registration, err := smokeRegistration(challenge, credential)
	if err != nil {
		return result, err
	}
	if err := wsjson.Write(ctx, control, registration); err != nil {
		return result, err
	}
	var registered RegisteredMessage
	if err := wsjson.Read(ctx, control, &registered); err != nil {
		if credential == "" && websocket.CloseStatus(err) == CloseCredentialNeeded {
			return result, nil
		}
		return result, fmt.Errorf("registering: %w", err)
	}

	echoed := make(chan error, 1)
	go func() { echoed <- echoOnce(ctx, base, control) }()
	device, err := dialChannel(ctx, base+"/v1/connect/"+registered.RouteID)
	if err != nil {
		return result, fmt.Errorf("connecting as a device: %w", err)
	}
	defer device.CloseNow()
	probe := make([]byte, 32)
	_, _ = rand.Read(probe)
	started := time.Now()
	if err := device.Write(ctx, websocket.MessageBinary, probe); err != nil {
		return result, err
	}
	_, reply, err := device.Read(ctx)
	if err != nil {
		return result, fmt.Errorf("reading the echo: %w", err)
	}
	result.RoundTrip = time.Since(started)
	if !bytes.Equal(reply, probe) {
		return result, errors.New("the relay did not carry the bytes unchanged")
	}
	if err := <-echoed; err != nil {
		return result, err
	}
	result.Bridged = true
	return result, nil
}
