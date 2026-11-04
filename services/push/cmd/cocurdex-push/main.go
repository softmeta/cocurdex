package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/softmeta/cocurdex/services/push/internal/push"
)

func main() {
	if err := run(os.Args[1:], os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, "cocurdex-push:", err)
		os.Exit(1)
	}
}

func run(args []string, stdout, stderr io.Writer) error {
	command := "serve"
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		command, args = args[0], args[1:]
	}
	switch command {
	case "serve":
		return serve(args, stderr)
	case "keygen":
		return keygen(stdout)
	default:
		return fmt.Errorf("unknown command %q (expected serve or keygen)", command)
	}
}

type serveOptions struct {
	listen            string
	handleKeysFile    string
	tlsCert           string
	tlsKey            string
	trustProxy        bool
	apnsKeyFile       string
	apnsKeyID         string
	apnsTeamID        string
	apnsTopic         string
	apnsEndpoint      string
	fcmServiceAccount string
	fcmEndpoint       string
}

func parseServe(args []string) (serveOptions, error) {
	flags := flag.NewFlagSet("serve", flag.ContinueOnError)
	options := serveOptions{}
	flags.StringVar(&options.listen, "listen", ":8080", "address to listen on")
	flags.StringVar(&options.handleKeysFile, "handle-keys-file", os.Getenv("COCURDEX_PUSH_HANDLE_KEYS_FILE"), "JSON file written by keygen")
	flags.StringVar(&options.tlsCert, "tls-cert", "", "TLS certificate file")
	flags.StringVar(&options.tlsKey, "tls-key", "", "TLS private key file")
	flags.BoolVar(&options.trustProxy, "trust-proxy", false, "read client addresses from X-Forwarded-For")
	flags.StringVar(&options.apnsKeyFile, "apns-key-file", os.Getenv("COCURDEX_PUSH_APNS_KEY_FILE"), "APNs auth key (.p8)")
	flags.StringVar(&options.apnsKeyID, "apns-key-id", os.Getenv("COCURDEX_PUSH_APNS_KEY_ID"), "APNs auth key id")
	flags.StringVar(&options.apnsTeamID, "apns-team-id", os.Getenv("COCURDEX_PUSH_APNS_TEAM_ID"), "Apple developer team id")
	flags.StringVar(&options.apnsTopic, "apns-topic", "dev.cocurdex.mobile", "iOS bundle id")
	flags.StringVar(&options.apnsEndpoint, "apns-endpoint", "", "send every APNs environment to this endpoint instead of Apple")
	flags.StringVar(&options.fcmServiceAccount, "fcm-service-account", os.Getenv("COCURDEX_PUSH_FCM_SERVICE_ACCOUNT"), "Firebase service account JSON file")
	flags.StringVar(&options.fcmEndpoint, "fcm-endpoint", "", "send FCM messages to this endpoint instead of Google")
	if err := flags.Parse(args); err != nil {
		return options, err
	}
	if options.handleKeysFile == "" {
		return options, errors.New("--handle-keys-file is required")
	}
	if (options.tlsCert == "") != (options.tlsKey == "") {
		return options, errors.New("--tls-cert and --tls-key go together")
	}
	return options, nil
}

type handleKeysFile struct {
	Current int               `json:"current"`
	Keys    map[string]string `json:"keys"`
}

func loadSealer(path string) (*push.HandleSealer, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var file handleKeysFile
	if err := json.Unmarshal(raw, &file); err != nil {
		return nil, fmt.Errorf("parse handle keys: %w", err)
	}
	keys := map[byte][]byte{}
	for id, encoded := range file.Keys {
		number, err := strconv.ParseUint(id, 10, 8)
		if err != nil {
			return nil, fmt.Errorf("handle key id %q is not 0-255", id)
		}
		key, err := push.DecodeBase64URL(encoded, push.HandleKeyLength)
		if err != nil {
			return nil, fmt.Errorf("handle key %s: %w", id, err)
		}
		keys[byte(number)] = key
	}
	if file.Current < 0 || file.Current > 255 {
		return nil, errors.New("current handle key id is not 0-255")
	}
	return push.NewHandleSealer(byte(file.Current), keys)
}

func apnsSender(options serveOptions) (push.Sender, error) {
	if options.apnsKeyFile == "" {
		return nil, nil
	}
	raw, err := os.ReadFile(options.apnsKeyFile)
	if err != nil {
		return nil, err
	}
	key, err := push.ParseAPNsKey(raw)
	if err != nil {
		return nil, err
	}
	config := push.APNsConfig{
		KeyID:      options.apnsKeyID,
		TeamID:     options.apnsTeamID,
		Topic:      options.apnsTopic,
		PrivateKey: key,
	}
	if options.apnsEndpoint != "" {
		config.Endpoints = map[string]string{
			push.EnvironmentProduction: options.apnsEndpoint,
			push.EnvironmentSandbox:    options.apnsEndpoint,
		}
	}
	return push.NewAPNsSender(config)
}

func fcmSender(options serveOptions) (push.Sender, error) {
	if options.fcmServiceAccount == "" {
		return nil, nil
	}
	raw, err := os.ReadFile(options.fcmServiceAccount)
	if err != nil {
		return nil, err
	}
	var account push.ServiceAccount
	if err := json.Unmarshal(raw, &account); err != nil {
		return nil, fmt.Errorf("parse FCM service account: %w", err)
	}
	return push.NewFCMSender(push.FCMConfig{Account: account, Endpoint: options.fcmEndpoint})
}

func senders(options serveOptions) (map[string]push.Sender, error) {
	configured := map[string]push.Sender{}
	apns, err := apnsSender(options)
	if err != nil {
		return nil, fmt.Errorf("APNs: %w", err)
	}
	if apns != nil {
		configured[push.PlatformAPNs] = apns
	}
	fcm, err := fcmSender(options)
	if err != nil {
		return nil, fmt.Errorf("FCM: %w", err)
	}
	if fcm != nil {
		configured[push.PlatformFCM] = fcm
	}
	return configured, nil
}

func serve(args []string, stderr io.Writer) error {
	options, err := parseServe(args)
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewTextHandler(stderr, nil))
	sealer, err := loadSealer(options.handleKeysFile)
	if err != nil {
		return err
	}
	configured, err := senders(options)
	if err != nil {
		return err
	}
	config := push.DefaultConfig()
	config.Sealer = sealer
	config.Senders = configured
	config.Logger = logger
	config.TrustProxy = options.trustProxy
	server := &http.Server{
		Addr:              options.listen,
		Handler:           push.NewServer(config),
		ReadHeaderTimeout: 10 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	errs := make(chan error, 1)
	go func() {
		platforms := make([]string, 0, len(configured))
		for platform := range configured {
			platforms = append(platforms, platform)
		}
		logger.Info("push gateway listening", "address", options.listen, "platforms", platforms)
		if options.tlsCert != "" {
			errs <- server.ListenAndServeTLS(options.tlsCert, options.tlsKey)
			return
		}
		errs <- server.ListenAndServe()
	}()
	select {
	case err := <-errs:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(shutdown)
	}
}

func keygen(stdout io.Writer) error {
	key := make([]byte, push.HandleKeyLength)
	if _, err := rand.Read(key); err != nil {
		return err
	}
	encoder := json.NewEncoder(stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(handleKeysFile{
		Current: 1,
		Keys:    map[string]string{"1": push.EncodeBase64URL(key)},
	})
}
