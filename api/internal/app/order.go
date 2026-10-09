package app

import (
	"context"
	"fmt"
)

type orderStatus string

const (
	statusCreated          orderStatus = "CREATED"
	statusReadyForPayment  orderStatus = "READY_FOR_PAYMENT"
	statusRejected         orderStatus = "REJECTED"
	statusPaymentPending   orderStatus = "PAYMENT_PENDING"
	statusPaid             orderStatus = "PAID"
	statusProcessing       orderStatus = "PROCESSING"
	statusCompleted        orderStatus = "COMPLETED"
	statusProcessingFailed orderStatus = "PROCESSING_FAILED"
	statusExpired          orderStatus = "EXPIRED"
	statusRefunded         orderStatus = "REFUNDED"
)

// orderStatuses must match the orders.status CHECK constraint; a migration test
// compares the two, so a new status cannot reach one without the other.
var orderStatuses = []orderStatus{
	statusCreated, statusReadyForPayment, statusRejected, statusPaymentPending, statusPaid,
	statusProcessing, statusCompleted, statusProcessingFailed, statusExpired, statusRefunded,
}

func parseOrderStatus(value string) (orderStatus, error) {
	for _, status := range orderStatuses {
		if string(status) == value {
			return status, nil
		}
	}
	return "", fmt.Errorf("unknown order status %q", value)
}

// fileKind is one accepted upload format. Values exist only as the variables
// below, so every kind has both a MIME type and a storage extension.
type fileKind struct{ mime, ext string }

var (
	pdfFile  = fileKind{"application/pdf", "pdf"}
	pngFile  = fileKind{"image/png", "png"}
	jpegFile = fileKind{"image/jpeg", "jpg"}
)

// fileKinds must match the order_files.mime CHECK constraint.
var fileKinds = []fileKind{pdfFile, pngFile, jpegFile}

func parseFileKind(mime string) (fileKind, bool) {
	for _, kind := range fileKinds {
		if kind.mime == mime {
			return kind, true
		}
	}
	return fileKind{}, false
}

const maxOrderFiles = 5

type orderFile struct {
	Path     string
	Kind     fileKind
	SHA256   string
	Size     int64
	Position int
}

// loadOrderFiles is the single read of an order's live originals. A row that
// the upload path could not have written means the order data is invalid.
func (a *App) loadOrderFiles(ctx context.Context, orderID string) ([]orderFile, error) {
	rows, err := a.DB.Query(ctx, `SELECT blob_path,mime,sha256,size_bytes,position FROM order_files WHERE order_id=$1 AND deleted_at IS NULL ORDER BY position`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	files := make([]orderFile, 0, maxOrderFiles)
	for rows.Next() {
		var file orderFile
		var mime string
		if err := rows.Scan(&file.Path, &mime, &file.SHA256, &file.Size, &file.Position); err != nil {
			return nil, err
		}
		kind, ok := parseFileKind(mime)
		if !ok {
			return nil, errInvalidOriginal
		}
		file.Kind = kind
		files = append(files, file)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(files) == 0 || len(files) > maxOrderFiles {
		return nil, errInvalidOriginal
	}
	return files, nil
}
