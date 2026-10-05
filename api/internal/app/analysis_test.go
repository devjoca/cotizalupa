package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
)

func TestAnalysisRequestPrivacyAndSchema(t *testing.T) {
	temp, err := os.CreateTemp("", "cotizalupa-request-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = temp.Close(); _ = os.Remove(temp.Name()) }()
	service := &App{OpenAIModel: defaultAnalysisModel}
	if err := service.writeAnalysisRequest(context.Background(), temp, nil, map[string]any{"situation": "synthetic"}); err != nil {
		t.Fatal(err)
	}
	if _, err := temp.Seek(0, 0); err != nil {
		t.Fatal(err)
	}
	var request struct {
		Model     string `json:"model"`
		Reasoning struct {
			Effort string `json:"effort"`
		} `json:"reasoning"`
		Store bool `json:"store"`
		Text  struct {
			Format struct {
				Type   string         `json:"type"`
				Strict bool           `json:"strict"`
				Schema map[string]any `json:"schema"`
			} `json:"format"`
		} `json:"text"`
		Instructions string `json:"instructions"`
	}
	if err := json.NewDecoder(temp).Decode(&request); err != nil {
		t.Fatal(err)
	}
	if request.Model != "gpt-6.1-sol" || request.Reasoning.Effort != "medium" {
		t.Fatal("analysis request lost the default model or reasoning effort")
	}
	if request.Store || !request.Text.Format.Strict || request.Text.Format.Type != "json_schema" || len(request.Text.Format.Schema) == 0 || request.Instructions == "" {
		t.Fatal("analysis boundary lost privacy or strict output")
	}
}

func TestLimitedReportIsPersistedAndReadable(t *testing.T) {
	requireLocalDB(t)
	ctx := context.Background()
	db := isolatedDB(t)
	orderID := uuid.NewString()
	token, hash, err := newReportToken()
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(ctx, `INSERT INTO orders(id,status,report_token_hash) VALUES($1,'PROCESSING',$2)`, orderID, hash)
	if err != nil {
		t.Fatal(err)
	}
	raw := []byte(`{"document":{"is_quotation":false,"quotation_count":0,"is_legible":false,"is_single_commercial_proposal":false,"rejection_reason":"El archivo no permite leer una cotización."},"clear_items":[],"gaps":[{"title":"Contenido ilegible","status":"missing","evidence":null,"missing":"Una cotización legible.","why_it_matters":"No es posible confirmar condiciones.","suggested_question":"¿Puedes solicitar una copia legible?"}],"what_if":[],"priorities":[],"quotation_facts":null}`)
	result, err := parseAnalysis(raw)
	if err != nil {
		t.Fatal(err)
	}
	app := &App{DB: db}
	if err := app.saveReport(ctx, orderID, analysisOutcome{Result: result, Model: "synthetic"}); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodGet, "/api/reports/"+token, nil)
	r.SetPathValue("token", token)
	w := httptest.NewRecorder()
	app.getReport(w, r)
	var response struct {
		Status   string `json:"status"`
		Analysis struct {
			Document struct {
				RejectionReason string `json:"rejection_reason"`
			} `json:"document"`
			Gaps []json.RawMessage `json:"gaps"`
		} `json:"analysis"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil || response.Status != "COMPLETED" || response.Analysis.Document.RejectionReason == "" || len(response.Analysis.Gaps) != 1 {
		t.Fatalf("limited report was not delivered: %s (%v)", w.Body.String(), err)
	}
}

func TestAnalysisRequestAttachmentsInLocalBucket(t *testing.T) {
	if os.Getenv("COTIZALUPA_LOCAL_BUCKET_TEST") != "1" {
		t.Skip("local bucket test is opt-in")
	}
	ctx := context.Background()
	bucket, name, err := openBucket()
	if err != nil {
		t.Fatal(err)
	}
	content := []byte("synthetic attachment")
	digest := sha256.Sum256(content)
	files := make([]analysisFile, 0, 2)
	for position, mime := range []string{"image/jpeg", "application/pdf"} {
		path := "tests/" + uuid.NewString()
		_, err := bucket.PutObject(ctx, name, path, bytes.NewReader(content), int64(len(content)), minio.PutObjectOptions{ContentType: mime})
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = bucket.RemoveObject(ctx, name, path, minio.RemoveObjectOptions{}) })
		files = append(files, analysisFile{Path: path, Mime: mime, SHA256: hex.EncodeToString(digest[:]), Size: int64(len(content)), Position: position})
	}
	temp, err := os.CreateTemp("", "cotizalupa-request-attachments-*")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = temp.Close(); _ = os.Remove(temp.Name()) }()
	service := &App{OpenAIModel: defaultAnalysisModel, Bucket: bucket, BucketName: name}
	if err := service.writeAnalysisRequest(ctx, temp, files, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := temp.Seek(0, 0); err != nil {
		t.Fatal(err)
	}
	var request struct {
		Input []struct {
			Content []map[string]any `json:"content"`
		} `json:"input"`
	}
	if err := json.NewDecoder(temp).Decode(&request); err != nil {
		t.Fatal(err)
	}
	contents := request.Input[0].Content
	if contents[1]["type"] != "input_image" || contents[1]["detail"] != "high" || contents[2]["type"] != "input_file" || contents[2]["filename"] != "cotizacion-2.pdf" {
		t.Fatalf("unexpected attachment shapes: %v, %v", contents[1], contents[2])
	}
	if _, ok := contents[2]["detail"]; ok {
		t.Fatal("PDF attachment contains image detail field")
	}
}

func TestAnalysisReportsMultipleQuotations(t *testing.T) {
	raw := []byte(`{"document":{"is_quotation":true,"quotation_count":2,"is_legible":true,"is_single_commercial_proposal":false,"rejection_reason":"dos propuestas"},"clear_items":[],"gaps":[{"title":"Varias propuestas","status":"ambiguous","evidence":null,"missing":"Identificar una sola propuesta.","why_it_matters":"No se puede atribuir cada condición a un proveedor.","suggested_question":"¿Cuál propuesta deseas revisar?"}],"what_if":[],"priorities":[],"quotation_facts":null}`)
	result, err := parseAnalysis(raw)
	if err != nil || result.analyzable() || len(result.Gaps) != 1 {
		t.Fatalf("expected valid limited report, got %v", err)
	}
	raw = []byte(`{"document":{"is_quotation":true,"quotation_count":2,"is_legible":true,"is_single_commercial_proposal":false,"rejection_reason":null},"clear_items":[],"gaps":[],"what_if":[],"priorities":[],"quotation_facts":null}`)
	if _, err := parseAnalysis(raw); err == nil {
		t.Fatal("missing rejection reason accepted")
	}
	missingArray := []byte(`{"document":{"is_quotation":false,"quotation_count":0,"is_legible":false,"is_single_commercial_proposal":false,"rejection_reason":"Ilegible"},"clear_items":[],"gaps":null,"what_if":[],"priorities":[],"quotation_facts":null}`)
	if _, err := parseAnalysis(missingArray); err == nil {
		t.Fatal("null gaps accepted")
	}
}

func TestParseAnalysisRejectsMissingAndNullValues(t *testing.T) {
	const valid = `{"document":{"is_quotation":true,"quotation_count":1,"is_legible":true,"is_single_commercial_proposal":true,"rejection_reason":null},"clear_items":[{"title":"Precio","detail":"El precio está indicado."}],"gaps":[{"title":"Plazo","status":"missing","evidence":null,"missing":null,"why_it_matters":"Permite planificar.","suggested_question":"¿Cuál es el plazo?"}],"what_if":["La entrega podría retrasarse."],"priorities":["Confirmar el plazo."],"quotation_facts":{"document_type":"quotation","service":null,"supplier":null,"amount":{"value_cents":null,"currency":null},"summary":null,"scope_summary":null,"delivery_summary":null,"payment_summary":null}}`
	if _, err := parseAnalysis([]byte(valid)); err != nil {
		t.Fatalf("valid report with nullable unknowns rejected: %v", err)
	}
	tests := []struct {
		name string
		edit func(map[string]any)
	}{
		{"missing top-level field", func(v map[string]any) { delete(v, "priorities") }},
		{"null document", func(v map[string]any) { v["document"] = nil }},
		{"null boolean", func(v map[string]any) { v["document"].(map[string]any)["is_legible"] = nil }},
		{"null count", func(v map[string]any) { v["document"].(map[string]any)["quotation_count"] = nil }},
		{"null array", func(v map[string]any) { v["clear_items"] = nil }},
		{"null finding", func(v map[string]any) { v["clear_items"] = []any{nil} }},
		{"missing finding detail", func(v map[string]any) { delete(v["clear_items"].([]any)[0].(map[string]any), "detail") }},
		{"null finding title", func(v map[string]any) { v["clear_items"].([]any)[0].(map[string]any)["title"] = nil }},
		{"null gap", func(v map[string]any) { v["gaps"] = []any{nil} }},
		{"missing nullable gap evidence", func(v map[string]any) { delete(v["gaps"].([]any)[0].(map[string]any), "evidence") }},
		{"null scenario", func(v map[string]any) { v["what_if"] = []any{nil} }},
		{"null priority", func(v map[string]any) { v["priorities"] = []any{nil} }},
		{"missing nullable fact", func(v map[string]any) { delete(v["quotation_facts"].(map[string]any), "service") }},
		{"missing amount", func(v map[string]any) { delete(v["quotation_facts"].(map[string]any), "amount") }},
		{"null amount", func(v map[string]any) { v["quotation_facts"].(map[string]any)["amount"] = nil }},
		{"missing nullable amount value", func(v map[string]any) {
			delete(v["quotation_facts"].(map[string]any)["amount"].(map[string]any), "value_cents")
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var value map[string]any
			if err := json.Unmarshal([]byte(valid), &value); err != nil {
				t.Fatal(err)
			}
			test.edit(value)
			raw, err := json.Marshal(value)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := parseAnalysis(raw); err == nil {
				t.Fatal("malformed report accepted")
			}
		})
	}
}
