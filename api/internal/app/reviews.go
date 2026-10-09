package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/pdfcpu/pdfcpu/pkg/api"
	"golang.org/x/text/unicode/norm"
)

const maxOrderBytes = 25 * 1024 * 1024

type reviewContext struct {
	Email   string `json:"email"`
	Concern string `json:"concern"`
	AdFBC   string `json:"ad_fbc"`
}

type preparedFile struct {
	Temp     *os.File
	Kind     fileKind
	Size     int64
	SHA256   string
	Pages    *int
	Position int
	Path     string
}

// The situation text must stay in sync with the web form's limits.
const minConcernRunes, maxConcernRunes = 10, 800

func cleanText(value string) string {
	return strings.Join(strings.Fields(norm.NFKC.String(value)), " ")
}

func (c *reviewContext) normalize() error {
	c.Email = strings.TrimSpace(c.Email)
	if !validEmail(c.Email) {
		return errors.New("invalid email")
	}
	c.Concern = cleanText(c.Concern)
	if !validMetaFBC(c.AdFBC) {
		c.AdFBC = ""
	}
	if length := len([]rune(c.Concern)); length < minConcernRunes || length > maxConcernRunes {
		return errors.New("invalid context")
	}
	return nil
}

func sniffFileKind(file *os.File) (fileKind, error) {
	header := make([]byte, 512)
	n, err := file.ReadAt(header, 0)
	if err != nil && !errors.Is(err, io.EOF) {
		return fileKind{}, err
	}
	mime := http.DetectContentType(header[:n])
	if i := strings.IndexByte(mime, ';'); i >= 0 {
		mime = mime[:i]
	}
	kind, ok := parseFileKind(mime)
	if !ok {
		return fileKind{}, errors.New("unsupported file")
	}
	return kind, nil
}

func validateFile(ctx context.Context, part *multipart.Part, position int, remaining int64) (preparedFile, error) {
	var result preparedFile
	if part.FormName() != "files" {
		return result, errors.New("unexpected form field")
	}
	file, err := os.CreateTemp("", "cotizalupa-upload-*")
	if err != nil {
		return result, err
	}
	result.Temp = file
	length, err := io.Copy(file, io.LimitReader(part, remaining+1))
	if err != nil {
		return result, err
	}
	if length == 0 || length > remaining {
		return result, errors.New("file limit exceeded")
	}
	kind, err := sniffFileKind(file)
	if err != nil {
		return result, err
	}
	if part.Header.Get("Content-Type") != "" && part.Header.Get("Content-Type") != kind.mime {
		return result, errors.New("MIME mismatch")
	}
	result.Kind, result.Size, result.Position = kind, length, position
	if kind == pdfFile {
		check, cancel := context.WithTimeout(ctx, 20*time.Second)
		defer cancel()
		if err := api.ValidateFile(check, file.Name(), nil, nil); err != nil {
			return result, errors.New("invalid PDF")
		}
		pages, err := api.PageCountFile(check, file.Name())
		if err != nil || pages < 1 || pages > 10 {
			return result, errors.New("invalid PDF page count")
		}
		result.Pages = &pages
	} else {
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			return result, err
		}
		config, _, err := image.DecodeConfig(file)
		if err != nil || config.Width < 1 || config.Height < 1 || config.Width > 12_000 || config.Height > 12_000 || int64(config.Width)*int64(config.Height) > 60_000_000 {
			return result, errors.New("invalid image dimensions")
		}
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return result, err
	}
	digest := sha256.New()
	if _, err := io.Copy(digest, file); err != nil {
		return result, err
	}
	result.SHA256 = hex.EncodeToString(digest.Sum(nil))
	return result, nil
}

type uploadResponse struct {
	Status      string      `json:"status"`
	Message     string      `json:"message,omitempty"`
	ReportToken reportToken `json:"report_token,omitempty"`
}

// Refusals carry a fixed message; only uploadReady carries a report token.
var (
	uploadRateLimited   = uploadResponse{Status: "RATE_LIMITED", Message: "Hay varias revisiones en curso o alcanzaste el límite de solicitudes. Inténtalo más tarde."}
	uploadInvalid       = uploadResponse{Status: "INVALID_UPLOAD", Message: "El archivo está dañado, no coincide con su tipo o supera los límites. Revisa los archivos y vuelve a intentar."}
	uploadStorageFailed = uploadResponse{Status: "STORAGE_FAILED", Message: "No pudimos guardar la cotización. Inténtalo de nuevo. No se realizó ningún cobro."}
)

func uploadReady(token reportToken) uploadResponse {
	return uploadResponse{Status: "READY_FOR_PAYMENT", ReportToken: token}
}

func (a *App) prepareReview(w http.ResponseWriter, r *http.Request) {
	if !a.allowPrepare(requestIP(r), time.Now()) {
		writeJSON(w, uploadRateLimited)
		return
	}
	defer a.donePrepare()
	r.Body = http.MaxBytesReader(w, r.Body, maxOrderBytes+2*1024*1024)
	reader, err := r.MultipartReader()
	if err != nil {
		http.Error(w, "invalid multipart upload", http.StatusBadRequest)
		return
	}
	var contextData reviewContext
	files := make([]preparedFile, 0, maxOrderFiles)
	defer func() {
		for _, item := range files {
			_ = item.Temp.Close()
			_ = os.Remove(item.Temp.Name())
		}
	}()
	var total int64
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			http.Error(w, "invalid upload", http.StatusBadRequest)
			return
		}
		if part.FormName() == "context" && len(files) == 0 {
			data, err := io.ReadAll(io.LimitReader(part, 8193))
			if err != nil || len(data) > 8192 || json.Unmarshal(data, &contextData) != nil {
				http.Error(w, "invalid context", http.StatusBadRequest)
				return
			}
			continue
		}
		if len(files) == maxOrderFiles {
			http.Error(w, "too many files", http.StatusBadRequest)
			return
		}
		item, err := validateFile(r.Context(), part, len(files), maxOrderBytes-total)
		if err != nil {
			if item.Temp != nil {
				_ = item.Temp.Close()
				_ = os.Remove(item.Temp.Name())
			}
			writeJSON(w, uploadInvalid)
			return
		}
		files = append(files, item)
		total += item.Size
	}
	if len(files) == 0 {
		http.Error(w, "missing files", http.StatusBadRequest)
		return
	}
	if err := contextData.normalize(); err != nil {
		http.Error(w, "invalid context", http.StatusBadRequest)
		return
	}
	orderID := uuid.NewString()
	token := a.ReportTokenSecret.token(orderID)
	tx, err := a.DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "unavailable", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())
	_, err = tx.Exec(r.Context(), `INSERT INTO orders(id,status,report_token_hash,user_context,email,meta_fbc)
		VALUES($1,'CREATED',$2,$3,$4,NULLIF($5,''))`, orderID, token.hash(), contextData.Concern, contextData.Email, contextData.AdFBC)
	if err != nil {
		http.Error(w, "unavailable", http.StatusInternalServerError)
		return
	}
	for i := range files {
		files[i].Path = fmt.Sprintf("orders/%s/%d.%s", orderID, i, files[i].Kind.ext)
		_, err = tx.Exec(r.Context(), `INSERT INTO order_files(id,order_id,position,blob_path,mime,size_bytes,sha256,pages)
			VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, uuid.NewString(), orderID, i, files[i].Path, files[i].Kind.mime, files[i].Size, files[i].SHA256, files[i].Pages)
		if err != nil {
			http.Error(w, "unavailable", http.StatusInternalServerError)
			return
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		http.Error(w, "unavailable", http.StatusInternalServerError)
		return
	}
	if step, err := a.stageOriginals(r.Context(), orderID, files); err != nil {
		slog.Error("storage write failed", "order_id", orderID, "step", step, "error", err.Error())
		CaptureOperationalError("storage_write_failed", map[string]string{"order_id": orderID, "step": step})
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, err := a.DB.Exec(ctx, `UPDATE orders SET status='REJECTED',delete_after=now(),user_context=NULL,email=NULL,updated_at=now() WHERE id=$1 AND status='CREATED'`, orderID); err != nil {
			CaptureOperationalError("storage_reject_failed", map[string]string{"order_id": orderID})
		}
		writeJSON(w, uploadStorageFailed)
		return
	}
	writeJSON(w, uploadReady(token))
}

// stageOriginals writes every validated file to the bucket and only then opens
// the order for payment. It returns the failing step for the operator alert.
func (a *App) stageOriginals(ctx context.Context, orderID string, files []preparedFile) (string, error) {
	for _, item := range files {
		if _, err := item.Temp.Seek(0, io.SeekStart); err != nil {
			return "temp_read", err
		}
		if _, err := a.Bucket.PutObject(ctx, a.BucketName, item.Path, item.Temp, item.Size, minio.PutObjectOptions{ContentType: item.Kind.mime}); err != nil {
			return "bucket_write", err
		}
	}
	var id string
	if err := a.DB.QueryRow(ctx, `UPDATE orders SET status='READY_FOR_PAYMENT',updated_at=now() WHERE id=$1 AND status='CREATED' RETURNING id`, orderID).Scan(&id); err != nil {
		return "ready_transition", err
	}
	return "", nil
}
