package main

import (
	"context"
	"crypto/ed25519"
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
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/softmeta/cocurdex/services/relay/internal/relay"
	"golang.org/x/crypto/acme/autocert"
)

func main() {
	if err := run(os.Args[1:], os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, "cocurdex-relay:", err)
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
	case "credential":
		return credential(args, stdout)
	case "revoke":
		return revoke(args, stdout)
	case "restore":
		return restore(args, stdout)
	case "revocations":
		return revocations(args, stdout)
	default:
		return fmt.Errorf(
			"unknown command %q (expected serve, keygen, credential, revoke, restore, or revocations)",
			command,
		)
	}
}

type serveOptions struct {
	listen           string
	dataDir          string
	tlsCert          string
	tlsKey           string
	autocertDomain   string
	credentialIssuer string
	trustProxy       bool
	maxSessions      int
	webRoot          string
}

func parseServe(args []string) (serveOptions, error) {
	flags := flag.NewFlagSet("serve", flag.ContinueOnError)
	options := serveOptions{}
	flags.StringVar(&options.listen, "listen", ":8080", "address to listen on")
	flags.StringVar(&options.dataDir, "data-dir", "", "directory for route bindings and certificates")
	flags.StringVar(&options.tlsCert, "tls-cert", "", "TLS certificate file")
	flags.StringVar(&options.tlsKey, "tls-key", "", "TLS private key file")
	flags.StringVar(&options.autocertDomain, "autocert-domain", "", "obtain a Let's Encrypt certificate for this domain")
	flags.StringVar(&options.credentialIssuer, "credential-issuer", "", "base64url Ed25519 public key that signs host credentials")
	flags.BoolVar(&options.trustProxy, "trust-proxy", false, "read client addresses from X-Forwarded-For")
	flags.IntVar(&options.maxSessions, "max-sessions-per-host", 32, "concurrent device sessions per host")
	flags.StringVar(&options.webRoot, "web-root", os.Getenv("COCURDEX_RELAY_WEB_ROOT"), "directory of the web client to serve on the relay's own origin")
	if err := flags.Parse(args); err != nil {
		return options, err
	}
	if (options.tlsCert == "") != (options.tlsKey == "") {
		return options, errors.New("--tls-cert and --tls-key go together")
	}
	if options.autocertDomain != "" && options.tlsCert != "" {
		return options, errors.New("use either --autocert-domain or --tls-cert, not both")
	}
	if options.autocertDomain != "" && options.dataDir == "" {
		return options, errors.New("--autocert-domain needs --data-dir to keep certificates")
	}
	return options, nil
}

func serve(args []string, stderr io.Writer) error {
	options, err := parseServe(args)
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewTextHandler(stderr, nil))
	bindings, err := relay.OpenBindings(options.dataDir)
	if err != nil {
		return err
	}
	revocations, err := relay.OpenRevocations(options.dataDir)
	if err != nil {
		return err
	}
	config := relay.DefaultConfig()
	config.Bindings = bindings
	config.Revocations = revocations
	config.Logger = logger
	config.TrustProxy = options.trustProxy
	config.MaxSessionsPerRoute = options.maxSessions
	if options.webRoot != "" {
		assets, err := relay.NewWebAssets(options.webRoot)
		if err != nil {
			return err
		}
		defer assets.Close()
		config.WebAssets = assets
	}
	if options.credentialIssuer != "" {
		issuer, err := relay.DecodeBase64URL(options.credentialIssuer, ed25519.PublicKeySize)
		if err != nil {
			return fmt.Errorf("--credential-issuer: %w", err)
		}
		config.CredentialIssuer = ed25519.PublicKey(issuer)
		if options.dataDir == "" {
			logger.Warn("without --data-dir, credentials cannot be revoked")
		}
	}
	relayServer := relay.NewServer(config)
	server := &http.Server{
		Addr:              options.listen,
		Handler:           relayServer,
		ReadHeaderTimeout: 10 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if config.CredentialIssuer != nil {
		go relayServer.EnforceCredentials(ctx, credentialSweepInterval)
	}
	errs := make(chan error, 1)
	go func() {
		logger.Info("relay listening", "address", options.listen)
		errs <- listen(server, options)
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

func listen(server *http.Server, options serveOptions) error {
	switch {
	case options.autocertDomain != "":
		manager := &autocert.Manager{
			Prompt:     autocert.AcceptTOS,
			HostPolicy: autocert.HostWhitelist(options.autocertDomain),
			Cache:      autocert.DirCache(filepath.Join(options.dataDir, "certificates")),
		}
		server.TLSConfig = manager.TLSConfig()
		go func() {
			_ = http.ListenAndServe(":80", manager.HTTPHandler(nil))
		}()
		return server.ListenAndServeTLS("", "")
	case options.tlsCert != "":
		return server.ListenAndServeTLS(options.tlsCert, options.tlsKey)
	default:
		return server.ListenAndServe()
	}
}

type issuerKeys struct {
	PublicKey  string `json:"publicKey"`
	PrivateKey string `json:"privateKey"`
}

func keygen(stdout io.Writer) error {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return err
	}
	return writeJSON(stdout, issuerKeys{
		PublicKey:  relay.EncodeBase64URL(public),
		PrivateKey: relay.EncodeBase64URL(private.Seed()),
	})
}

func credential(args []string, stdout io.Writer) error {
	flags := flag.NewFlagSet("credential", flag.ContinueOnError)
	keyFile := flags.String("issuer-key-file", "", "JSON file written by keygen")
	account := flags.String("account", "", "account or invite id")
	relayURL := flags.String("relay", "", "relay URL the credential is for")
	days := flags.Int("days", 30, "days until the credential expires")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *keyFile == "" || *account == "" || *relayURL == "" {
		return errors.New("--issuer-key-file, --account, and --relay are required")
	}
	if *days <= 0 {
		return errors.New("--days must be positive")
	}
	raw, err := os.ReadFile(*keyFile)
	if err != nil {
		return err
	}
	var keys issuerKeys
	if err := json.Unmarshal(raw, &keys); err != nil {
		return fmt.Errorf("parse issuer key file: %w", err)
	}
	seed, err := relay.DecodeBase64URL(keys.PrivateKey, ed25519.SeedSize)
	if err != nil {
		return fmt.Errorf("issuer private key: %w", err)
	}
	expires := time.Now().Add(time.Duration(*days) * 24 * time.Hour)
	token, err := relay.IssueCredential(ed25519.NewKeyFromSeed(seed), *account, *relayURL, expires)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintln(stdout, token)
	return err
}

const credentialSweepInterval = 10 * time.Second

func revocationFlags(name string) (*flag.FlagSet, *string, *string) {
	flags := flag.NewFlagSet(name, flag.ContinueOnError)
	dataDir := flags.String("data-dir", "", "the relay's --data-dir")
	account := flags.String("account", "", "account or invite id the credential was issued for")
	return flags, dataDir, account
}

func revoke(args []string, stdout io.Writer) error {
	flags, dataDir, account := revocationFlags("revoke")
	reason := flags.String("reason", "", "why the account was revoked")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *dataDir == "" || *account == "" {
		return errors.New("--data-dir and --account are required")
	}
	if err := relay.RevokeAccount(*dataDir, *account, *reason, time.Now()); err != nil {
		return err
	}
	_, err := fmt.Fprintf(stdout, "revoked %s; a running relay disconnects it within %s\n", *account, credentialSweepInterval)
	return err
}

func restore(args []string, stdout io.Writer) error {
	flags, dataDir, account := revocationFlags("restore")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *dataDir == "" || *account == "" {
		return errors.New("--data-dir and --account are required")
	}
	restored, err := relay.RestoreAccount(*dataDir, *account)
	if err != nil {
		return err
	}
	if !restored {
		return fmt.Errorf("%s is not revoked", *account)
	}
	_, err = fmt.Fprintf(stdout, "restored %s\n", *account)
	return err
}

func revocations(args []string, stdout io.Writer) error {
	flags := flag.NewFlagSet("revocations", flag.ContinueOnError)
	dataDir := flags.String("data-dir", "", "the relay's --data-dir")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *dataDir == "" {
		return errors.New("--data-dir is required")
	}
	list, err := relay.ListRevocations(*dataDir)
	if err != nil {
		return err
	}
	return writeJSON(stdout, list)
}

func writeJSON(stdout io.Writer, value any) error {
	encoder := json.NewEncoder(stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}
