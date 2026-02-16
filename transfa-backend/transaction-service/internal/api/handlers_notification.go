package api

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/transfa/transaction-service/internal/domain"
)

type markAllReadPayload struct {
	Category *string `json:"category,omitempty"`
}

func parseOptionalPositiveInt(raw string, defaultValue int) (int, error) {
	if strings.TrimSpace(raw) == "" {
		return defaultValue, nil
	}
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return 0, err
	}
	if value < 0 {
		return 0, errors.New("must be >= 0")
	}
	return value, nil
}

func normalizeNotificationCategoryFilter(raw string) (string, error) {
	category := strings.TrimSpace(strings.ToLower(raw))
	if category == "" {
		return "", nil
	}
	switch category {
	case "request", "newsletter", "system":
		return category, nil
	default:
		return "", errors.New("invalid notification category")
	}
}

func normalizeNotificationStatusFilter(raw string) (string, error) {
	status := strings.TrimSpace(strings.ToLower(raw))
	if status == "" {
		return "", nil
	}
	switch status {
	case "unread", "read":
		return status, nil
	default:
		return "", errors.New("invalid notification status")
	}
}

// ListInAppNotificationsHandler lists inbox notifications for the authenticated user.
func (h *TransactionHandlers) ListInAppNotificationsHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	limit, err := parseOptionalPositiveInt(r.URL.Query().Get("limit"), 50)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid limit")
		return
	}
	offset, err := parseOptionalPositiveInt(r.URL.Query().Get("offset"), 0)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid offset")
		return
	}

	categoryFilter, err := normalizeNotificationCategoryFilter(r.URL.Query().Get("category"))
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid category")
		return
	}
	statusFilter, err := normalizeNotificationStatusFilter(r.URL.Query().Get("status"))
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid status")
		return
	}

	opts := domain.NotificationListOptions{
		Limit:    limit,
		Offset:   offset,
		Search:   strings.TrimSpace(r.URL.Query().Get("q")),
		Category: categoryFilter,
		Status:   statusFilter,
	}

	items, err := h.service.ListInAppNotifications(r.Context(), userID, opts)
	if err != nil {
		log.Printf("level=error component=api endpoint=list_notifications outcome=failed user_id=%s err=%v", userID, err)
		h.writeError(w, http.StatusInternalServerError, "Could not retrieve notifications.")
		return
	}

	h.writeJSON(w, http.StatusOK, items)
}

// GetInAppNotificationUnreadCountsHandler returns unread counts by category.
func (h *TransactionHandlers) GetInAppNotificationUnreadCountsHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	counts, err := h.service.GetInAppNotificationUnreadCounts(r.Context(), userID)
	if err != nil {
		log.Printf("level=error component=api endpoint=get_notification_unread_counts outcome=failed user_id=%s err=%v", userID, err)
		h.writeError(w, http.StatusInternalServerError, "Could not retrieve unread counts.")
		return
	}

	h.writeJSON(w, http.StatusOK, counts)
}

// MarkInAppNotificationReadHandler marks one notification as read.
func (h *TransactionHandlers) MarkInAppNotificationReadHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	notificationID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid notification ID")
		return
	}

	ok, err := h.service.MarkInAppNotificationRead(r.Context(), userID, notificationID)
	if err != nil {
		log.Printf("level=error component=api endpoint=mark_notification_read outcome=failed user_id=%s notification_id=%s err=%v", userID, notificationID, err)
		h.writeError(w, http.StatusInternalServerError, "Could not update notification.")
		return
	}
	if !ok {
		h.writeError(w, http.StatusNotFound, "Notification not found.")
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]bool{"updated": true})
}

// MarkAllInAppNotificationsReadHandler marks unread notifications as read.
func (h *TransactionHandlers) MarkAllInAppNotificationsReadHandler(w http.ResponseWriter, r *http.Request) {
	userID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	var payload markAllReadPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil && !errors.Is(err, io.EOF) {
		h.writeError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	if payload.Category != nil {
		normalizedCategory, err := normalizeNotificationCategoryFilter(*payload.Category)
		if err != nil {
			h.writeError(w, http.StatusBadRequest, "Invalid category")
			return
		}
		payload.Category = &normalizedCategory
	}

	updated, err := h.service.MarkAllInAppNotificationsRead(r.Context(), userID, payload.Category)
	if err != nil {
		log.Printf("level=error component=api endpoint=mark_all_notifications_read outcome=failed user_id=%s err=%v", userID, err)
		h.writeError(w, http.StatusInternalServerError, "Could not update notifications.")
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]int64{"updated": updated})
}
