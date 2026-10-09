package app

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func corsTestApp(t *testing.T, frontend string) *App {
	t.Helper()
	publicURL, err := url.Parse(frontend)
	if err != nil {
		t.Fatal(err)
	}
	return &App{PublicURL: publicURL}
}

// stubAPI mimics the real routes: availability GET, checkout POST, and a
// report GET that sets the same cache/robots headers as getReport.
func stubAPI(calls *int) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/availability", func(w http.ResponseWriter, _ *http.Request) {
		*calls++
		writeJSON(w, map[string]bool{"reviewsDisabled": false})
	})
	mux.HandleFunc("POST /api/checkouts", func(w http.ResponseWriter, _ *http.Request) {
		*calls++
		writeJSON(w, map[string]string{"status": "PENDING"})
	})
	mux.HandleFunc("GET /api/reports/{token}", func(w http.ResponseWriter, _ *http.Request) {
		*calls++
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Robots-Tag", "noindex, nofollow")
		writeJSON(w, map[string]string{"status": "NOT_FOUND"})
	})
	mux.HandleFunc("GET /api/boom", func(w http.ResponseWriter, _ *http.Request) {
		*calls++
		http.Error(w, "unavailable", http.StatusInternalServerError)
	})
	return mux
}

func TestCORSAllowedOrigin(t *testing.T) {
	const frontend = "http://localhost:3002"
	service := corsTestApp(t, frontend)
	var calls int
	handler := service.withCORS(stubAPI(&calls))

	t.Run("actual GET carries the allow header and Vary", func(t *testing.T) {
		calls = 0
		request := httptest.NewRequest(http.MethodGet, "/api/availability", nil)
		request.Header.Set("Origin", frontend)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("status %d", response.Code)
		}
		if got := response.Header().Get("Access-Control-Allow-Origin"); got != frontend {
			t.Fatalf("ACAO %q, want %q", got, frontend)
		}
		if vary := response.Header().Get("Vary"); !strings.Contains(vary, "Origin") {
			t.Fatalf("Vary %q misses Origin", vary)
		}
		if calls != 1 {
			t.Fatalf("handler ran %d times, want 1", calls)
		}
	})

	t.Run("actual POST with JSON content type is allowed", func(t *testing.T) {
		calls = 0
		request := httptest.NewRequest(http.MethodPost, "/api/checkouts", strings.NewReader(`{"token":"x"}`))
		request.Header.Set("Origin", frontend)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("status %d", response.Code)
		}
		if got := response.Header().Get("Access-Control-Allow-Origin"); got != frontend {
			t.Fatalf("ACAO %q, want %q", got, frontend)
		}
		if calls != 1 {
			t.Fatalf("handler ran %d times, want 1", calls)
		}
	})

	t.Run("preflight answers without running API logic", func(t *testing.T) {
		calls = 0
		request := httptest.NewRequest(http.MethodOptions, "/api/checkouts", nil)
		request.Header.Set("Origin", frontend)
		request.Header.Set("Access-Control-Request-Method", "POST")
		request.Header.Set("Access-Control-Request-Headers", "Content-Type")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusNoContent {
			t.Fatalf("preflight status %d", response.Code)
		}
		if got := response.Header().Get("Access-Control-Allow-Origin"); got != frontend {
			t.Fatalf("ACAO %q, want %q", got, frontend)
		}
		if methods := response.Header().Get("Access-Control-Allow-Methods"); !strings.Contains(methods, "POST") {
			t.Fatalf("allow-methods %q misses POST", methods)
		}
		if headers := response.Header().Get("Access-Control-Allow-Headers"); !strings.Contains(headers, "Content-Type") {
			t.Fatalf("allow-headers %q misses Content-Type", headers)
		}
		if calls != 0 {
			t.Fatalf("preflight executed API logic %d times", calls)
		}
	})

	t.Run("preflight to the upload endpoint never runs validation", func(t *testing.T) {
		upload := http.NewServeMux()
		upload.HandleFunc("POST /api/reviews", func(w http.ResponseWriter, _ *http.Request) {
			calls++
			w.WriteHeader(http.StatusOK)
		})
		wrapped := service.withCORS(upload)
		calls = 0
		request := httptest.NewRequest(http.MethodOptions, "/api/reviews", nil)
		request.Header.Set("Origin", frontend)
		request.Header.Set("Access-Control-Request-Method", "POST")
		response := httptest.NewRecorder()
		wrapped.ServeHTTP(response, request)
		if response.Code != http.StatusNoContent {
			t.Fatalf("preflight status %d", response.Code)
		}
		if calls != 0 {
			t.Fatalf("upload preflight executed handler %d times", calls)
		}
	})

	t.Run("error responses carry CORS headers too", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodGet, "/api/boom", nil)
		request.Header.Set("Origin", frontend)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusInternalServerError {
			t.Fatalf("status %d", response.Code)
		}
		if got := response.Header().Get("Access-Control-Allow-Origin"); got != frontend {
			t.Fatalf("ACAO %q on error, want %q", got, frontend)
		}
	})

	t.Run("report cache and robots headers survive CORS", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodGet, "/api/reports/abc", nil)
		request.Header.Set("Origin", frontend)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if got := response.Header().Get("Cache-Control"); got != "no-store" {
			t.Fatalf("Cache-Control %q, want no-store", got)
		}
		if got := response.Header().Get("X-Robots-Tag"); got != "noindex, nofollow" {
			t.Fatalf("X-Robots-Tag %q", got)
		}
		if got := response.Header().Get("Access-Control-Allow-Origin"); got != frontend {
			t.Fatalf("ACAO %q, want %q", got, frontend)
		}
	})
}

func TestCORSDisallowedOrigins(t *testing.T) {
	service := corsTestApp(t, "https://cotizalupa.com")
	var calls int
	handler := service.withCORS(stubAPI(&calls))

	for _, origin := range []string{
		"https://evil.example",
		"http://cotizalupa.com",
		"https://cotizalupa.com:443",
		"https://www.cotizalupa.com",
		"https://cotizalupa.com.evil.example",
	} {
		t.Run("actual request from "+origin+" gets no allow header", func(t *testing.T) {
			calls = 0
			request := httptest.NewRequest(http.MethodGet, "/api/availability", nil)
			request.Header.Set("Origin", origin)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusOK {
				t.Fatalf("status %d", response.Code)
			}
			if got := response.Header().Get("Access-Control-Allow-Origin"); got != "" {
				t.Fatalf("ACAO %q for disallowed origin", got)
			}
			if calls != 1 {
				t.Fatalf("handler ran %d times, want 1", calls)
			}
		})

		t.Run("preflight from "+origin+" runs nothing and allows nothing", func(t *testing.T) {
			calls = 0
			request := httptest.NewRequest(http.MethodOptions, "/api/checkouts", nil)
			request.Header.Set("Origin", origin)
			request.Header.Set("Access-Control-Request-Method", "POST")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if got := response.Header().Get("Access-Control-Allow-Origin"); got != "" {
				t.Fatalf("ACAO %q for disallowed preflight", got)
			}
			if calls != 0 {
				t.Fatalf("disallowed preflight executed handler %d times", calls)
			}
		})
	}
}

func TestCORSRequestsWithoutOrigin(t *testing.T) {
	service := corsTestApp(t, "https://cotizalupa.com")
	var calls int
	handler := service.withCORS(stubAPI(&calls))

	t.Run("webhook and health style requests keep working", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodGet, "/api/availability", nil)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("status %d", response.Code)
		}
		if got := response.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Fatalf("unexpected ACAO %q without Origin", got)
		}
		if calls != 1 {
			t.Fatalf("handler ran %d times, want 1", calls)
		}
	})
}

// OPTIONS against the real handler must short-circuit before touching the
// database: App.DB is nil here, so reaching checkout or upload logic panics.
func TestCORSOptionsNeverReachesRealHandlers(t *testing.T) {
	service := corsTestApp(t, "http://localhost:3002")
	handler := service.Handler()
	for _, path := range []string{"/api/checkouts", "/api/reviews", "/api/reports/abc"} {
		request := httptest.NewRequest(http.MethodOptions, path, nil)
		request.Header.Set("Origin", "http://localhost:3002")
		request.Header.Set("Access-Control-Request-Method", "POST")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusNoContent {
			t.Fatalf("%s preflight status %d", path, response.Code)
		}
	}
}
