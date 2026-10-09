package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

const defaultAnalysisModel = "gpt-6.1-sol"

type App struct {
	ReportTokenSecret  reportTokenSecret
	Mailer             resendMailer
	Meta               *metaClient // nil when purchase tracking is off
	DB                 *pgxpool.Pool
	Bucket             *minio.Client
	BucketName         string
	PolarAccessToken   string
	PolarProductID     string
	PolarWebhookSecret string
	PolarBaseURL       string
	PublicURL          *url.URL
	OpenAIKey          string
	OpenAIModel        string
	Disabled           bool
	process            chan struct{}
	guardMu            sync.Mutex
	rate               map[string][]time.Time
	preparing          int
}

// New reads and checks all configuration before opening the database, so a
// bad deploy fails fast without holding connections.
func New(ctx context.Context) (*App, error) {
	onRailway := os.Getenv("RAILWAY_ENVIRONMENT_ID") != ""
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		if onRailway {
			return nil, errors.New("DATABASE_URL is required")
		}
		dbURL = "postgres://cotizalupa:cotizalupa@127.0.0.1:55432/cotizalupa?sslmode=disable"
	}
	bucket, name, err := openBucket()
	if err != nil {
		return nil, err
	}
	publicURL, err := url.Parse(os.Getenv("PUBLIC_APP_URL"))
	if err != nil || publicURL.Scheme == "" || publicURL.Host == "" {
		return nil, errors.New("PUBLIC_APP_URL is required")
	}
	if onRailway && publicURL.Scheme != "https" {
		return nil, errors.New("PUBLIC_APP_URL must use HTTPS")
	}
	var polarBase string
	switch os.Getenv("POLAR_ENVIRONMENT") {
	case "production":
		polarBase = "https://api.polar.sh"
	case "sandbox":
		polarBase = "https://sandbox-api.polar.sh"
	default:
		return nil, errors.New("POLAR_ENVIRONMENT must be production or sandbox")
	}
	app := &App{
		Bucket: bucket, BucketName: name,
		PolarAccessToken: os.Getenv("POLAR_ACCESS_TOKEN"), PolarProductID: os.Getenv("POLAR_PRODUCT_ID"),
		PolarWebhookSecret: os.Getenv("POLAR_WEBHOOK_SECRET"), PolarBaseURL: polarBase,
		PublicURL: publicURL, OpenAIKey: os.Getenv("OPENAI_API_KEY"), OpenAIModel: os.Getenv("OPENAI_ANALYSIS_MODEL"),
		Mailer:   resendMailer{APIKey: os.Getenv("RESEND_API_KEY"), From: os.Getenv("RESEND_FROM")},
		Disabled: os.Getenv("REVIEWS_DISABLED") == "true", process: make(chan struct{}, 1), rate: map[string][]time.Time{},
	}
	if app.ReportTokenSecret, err = parseReportTokenSecret(os.Getenv("REPORT_TOKEN_SECRET")); err != nil {
		return nil, err
	}
	if app.Mailer.APIKey == "" || app.Mailer.From == "" {
		return nil, errors.New("RESEND_API_KEY and RESEND_FROM are required")
	}
	if app.PolarAccessToken == "" || app.PolarProductID == "" || app.PolarWebhookSecret == "" {
		return nil, errors.New("Polar configuration is required")
	}
	pixelID, metaToken := os.Getenv("META_PIXEL_ID"), os.Getenv("META_ACCESS_TOKEN")
	if (pixelID == "") != (metaToken == "") || (pixelID != "" && !validMetaPixelID(pixelID)) {
		return nil, errors.New("META_PIXEL_ID and META_ACCESS_TOKEN must be configured together")
	}
	if pixelID != "" {
		app.Meta = &metaClient{PixelID: pixelID, AccessToken: metaToken}
	}
	if app.OpenAIModel == "" {
		app.OpenAIModel = defaultAnalysisModel
	}
	if app.OpenAIKey == "" && !(os.Getenv("AI_STUB") == "1" && !onRailway) {
		return nil, errors.New("OPENAI_API_KEY is required")
	}
	config, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		return nil, err
	}
	config.MaxConns = 3
	if app.DB, err = pgxpool.NewWithConfig(ctx, config); err != nil {
		return nil, err
	}
	if err = app.DB.Ping(ctx); err != nil {
		app.DB.Close()
		return nil, fmt.Errorf("database unavailable: %w", err)
	}
	return app, nil
}

func openBucket() (*minio.Client, string, error) {
	name, endpoint, key, secret := os.Getenv("AWS_S3_BUCKET_NAME"), os.Getenv("AWS_ENDPOINT_URL"), os.Getenv("AWS_ACCESS_KEY_ID"), os.Getenv("AWS_SECRET_ACCESS_KEY")
	if name == "" && endpoint == "" && key == "" && secret == "" && os.Getenv("RAILWAY_ENVIRONMENT_ID") == "" {
		name, endpoint, key, secret = "cotizalupa", "http://127.0.0.1:59000", "cotizalupa-local", "cotizalupa-local-secret"
	}
	if name == "" || endpoint == "" || key == "" || secret == "" {
		return nil, "", errors.New("bucket configuration is incomplete")
	}
	u, err := url.Parse(endpoint)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return nil, "", errors.New("invalid bucket endpoint")
	}
	region := os.Getenv("AWS_DEFAULT_REGION")
	if region == "" {
		region = "auto"
	}
	bucket, err := minio.New(u.Host, &minio.Options{
		Creds: credentials.NewStaticV4(key, secret, ""), Secure: u.Scheme == "https", Region: region,
		BucketLookup: minio.BucketLookupPath,
	})
	return bucket, name, err
}

func (a *App) Close() { a.DB.Close() }

func (a *App) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/availability", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, struct {
			ReviewsDisabled bool `json:"reviewsDisabled"`
		}{a.Disabled})
	})
	mux.HandleFunc("POST /api/reviews", a.prepareReview)
	mux.HandleFunc("GET /api/reports/{token}", a.getReport)
	mux.HandleFunc("POST /api/checkouts", a.checkout)
	mux.HandleFunc("POST /api/webhooks/polar", polarWebhook(a.DB, a.PolarWebhookSecret, a.PolarProductID, a.process))
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	return a.withCORS(mux)
}

func (a *App) Run(ctx context.Context) error {
	go a.work(ctx)
	if a.Meta != nil {
		go a.workMetaPurchases(ctx, *a.Meta)
	}
	port := os.Getenv("PORT")
	if _, err := strconv.Atoi(port); err != nil {
		port = "3001"
	}
	server := &http.Server{Addr: ":" + port, Handler: a.Handler(), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		<-ctx.Done()
		stop, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_ = server.Shutdown(stop)
		FlushMonitoring(2 * time.Second)
	}()
	slog.Info("CotizaLupa listening", "port", port)
	err := server.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	CaptureOperationalError("http_server_failed", nil)
	return err
}

const (
	uploadsPerIPPerHour    = 60
	concurrentPreparations = 4
)

func (a *App) allowPrepare(ip string, now time.Time) bool {
	a.guardMu.Lock()
	defer a.guardMu.Unlock()
	if a.preparing >= concurrentPreparations {
		return false
	}
	if len(a.rate) > 1000 {
		for key, history := range a.rate {
			if len(history) == 0 || now.Sub(history[len(history)-1]) >= time.Hour {
				delete(a.rate, key)
			}
		}
	}
	items := a.rate[ip]
	live := items[:0]
	for _, item := range items {
		if now.Sub(item) < time.Hour {
			live = append(live, item)
		}
	}
	if len(live) >= uploadsPerIPPerHour {
		a.rate[ip] = live
		return false
	}
	a.rate[ip] = append(live, now)
	a.preparing++
	return true
}

func (a *App) donePrepare() { a.guardMu.Lock(); a.preparing--; a.guardMu.Unlock() }

// requestIP takes the last X-Forwarded-For entry: the edge proxy appends the
// address it saw, while earlier entries are whatever the client sent.
func requestIP(r *http.Request) string {
	header := r.Header.Get("X-Forwarded-For")
	if forwarded := strings.TrimSpace(header[strings.LastIndexByte(header, ',')+1:]); forwarded != "" {
		return forwarded
	}
	return r.RemoteAddr
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(value)
}
