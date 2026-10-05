package app

import (
	"log/slog"
	"os"
	"time"

	"github.com/getsentry/sentry-go"
)

// monitoringReady is written once by InitMonitoring before any goroutine
// starts, so readers need no lock.
var monitoringReady bool

// InitMonitoring starts Sentry only when SENTRY_DSN is set. Manual capture
// only: no tracing, no automatic request/breadcrumb collection, and events are
// scrubbed so no document content, identity, or request data leaves the service.
func InitMonitoring() {
	dsn := os.Getenv("SENTRY_DSN")
	if dsn == "" {
		return
	}
	err := sentry.Init(sentry.ClientOptions{
		Dsn:              dsn,
		AttachStacktrace: true,
		SendDefaultPII:   false,
		BeforeSend: func(event *sentry.Event, _ *sentry.EventHint) *sentry.Event {
			event.Request = nil
			event.User = sentry.User{}
			event.Breadcrumbs = nil
			event.Contexts = nil
			event.Modules = nil
			return event
		},
	})
	if err != nil {
		slog.Error("sentry initialization failed", "error", err.Error())
		return
	}
	monitoringReady = true
}

// CaptureOperationalError reports a stable operational code with optional tags.
// It never sends document content, user identity, or request data; the code and
// tags are the whole payload. Without SENTRY_DSN it is a no-op.
func CaptureOperationalError(code string, tags map[string]string) {
	if !monitoringReady {
		return
	}
	event := sentry.NewEvent()
	event.Level = sentry.LevelError
	event.Message = code
	for key, value := range tags {
		event.Tags[key] = value
	}
	sentry.CaptureEvent(event)
}

// FlushMonitoring waits for queued events before shutdown. A missing DSN is not
// an error; nothing was queued.
func FlushMonitoring(timeout time.Duration) {
	if !monitoringReady {
		return
	}
	sentry.Flush(timeout)
}
