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
	default:
		return fmt.Errorf("unknown command %q (expected serve, keygen, or credential)", command)
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
	config := relay.DefaultConfig()
	config.Bindings = bindings
	config.Logger = logger
	config.TrustProxy = options.trustProxy
	config.MaxSessionsPerRoute = options.maxSessions
	if options.credentialIssuer != "" {
		issuer, err := relay.DecodeBase64URL(options.credentialIssuer, ed25519.PublicKeySize)
		if err != nil {
			return fmt.Errorf("--credential-issuer: %w", err)
		}
		config.CredentialIssuer = ed25519.PublicKey(issuer)
	}
	server := &http.Server{
		Addr:              options.listen,
		Handler:           relay.NewServer(config),
		ReadHeaderTimeout: 10 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
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
	days := flags.Int("days", 30, "days until the credential expires")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *keyFile == "" || *account == "" {
		return errors.New("--issuer-key-file and --account are required")
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
	issued := relay.IssueCredential(ed25519.NewKeyFromSeed(seed), *account, expires)
	return writeJSON(stdout, issued)
}

func writeJSON(stdout io.Writer, value any) error {
	encoder := json.NewEncoder(stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}
