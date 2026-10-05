package app

import (
	"net/http"
	"strings"
)

// allowedBrowserOrigin is the exact PUBLIC_APP_URL origin (scheme, host, and
// port) that browsers run the frontend from. CORS trusts only this origin;
// payment verification and report-token checks still enforce everything.
func (a *App) allowedBrowserOrigin() string {
	if a == nil || a.PublicURL == nil {
		return ""
	}
	return a.PublicURL.Scheme + "://" + a.PublicURL.Host
}

// withCORS applies the browser-origin policy to /api/* requests. Requests
// without an Origin header (Polar webhooks, health checks, curl) pass through
// untouched. Preflights never reach the wrapped handler, so an OPTIONS request
// cannot execute upload or checkout logic.
func (a *App) withCORS(next http.Handler) http.Handler {
	allowed := a.allowedBrowserOrigin()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		origin := r.Header.Get("Origin")
		if origin == "" {
			next.ServeHTTP(w, r)
			return
		}
		if origin != allowed || allowed == "" {
			// Disallowed origins get no CORS headers, so the browser blocks
			// the response. Still handle preflights here so they never run
			// API logic.
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Max-Age", "86400")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
