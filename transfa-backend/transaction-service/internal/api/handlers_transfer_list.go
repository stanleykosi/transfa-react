package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/transfa/transaction-service/internal/app"
	"github.com/transfa/transaction-service/internal/domain"
	"github.com/transfa/transaction-service/internal/store"
)

func mapTransferListError(err error) (int, string) {
	switch {
	case errors.Is(err, app.ErrTransferListNotFound), errors.Is(err, store.ErrTransferListNotFound):
		return http.StatusNotFound, "Transfer list not found."
	case errors.Is(err, store.ErrUserNotFound):
		return http.StatusNotFound, "User not found."
	case errors.Is(err, app.ErrTransferListNameRequired),
		errors.Is(err, app.ErrTransferListNameLength),
		errors.Is(err, app.ErrTransferListEmpty),
		errors.Is(err, app.ErrTransferListMemberLimit),
		errors.Is(err, app.ErrTransferListDuplicateMember),
		errors.Is(err, app.ErrTransferListSelfMember),
		errors.Is(err, app.ErrInvalidRecipient):
		return http.StatusBadRequest, err.Error()
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if pgErr.Code == "23505" {
			return http.StatusConflict, "A list with this name already exists."
		}
	}

	return http.StatusInternalServerError, "Could not process transfer list request."
}

func (h *TransactionHandlers) ListTransferListsHandler(w http.ResponseWriter, r *http.Request) {
	ownerID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	limit, err := parseOptionalPositiveInt(r.URL.Query().Get("limit"), 30)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid limit")
		return
	}
	offset, err := parseOptionalPositiveInt(r.URL.Query().Get("offset"), 0)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid offset")
		return
	}

	items, err := h.service.ListTransferLists(r.Context(), ownerID, domain.TransferListListOptions{
		Limit:  limit,
		Offset: offset,
		Search: strings.TrimSpace(r.URL.Query().Get("q")),
	})
	if err != nil {
		log.Printf("level=error component=api endpoint=list_transfer_lists outcome=failed owner_id=%s err=%v", ownerID, err)
		h.writeError(w, http.StatusInternalServerError, "Could not retrieve transfer lists.")
		return
	}

	h.writeJSON(w, http.StatusOK, items)
}

func (h *TransactionHandlers) CreateTransferListHandler(w http.ResponseWriter, r *http.Request) {
	ownerID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	var payload domain.CreateTransferListPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request payload.")
		return
	}

	result, err := h.service.CreateTransferList(r.Context(), ownerID, payload)
	if err != nil {
		status, msg := mapTransferListError(err)
		if status == http.StatusInternalServerError {
			log.Printf("level=error component=api endpoint=create_transfer_list outcome=failed owner_id=%s err=%v", ownerID, err)
		}
		h.writeError(w, status, msg)
		return
	}

	h.writeJSON(w, http.StatusCreated, result)
}

func (h *TransactionHandlers) GetTransferListByIDHandler(w http.ResponseWriter, r *http.Request) {
	ownerID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	listID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid list ID")
		return
	}

	result, err := h.service.GetTransferListByID(r.Context(), ownerID, listID)
	if err != nil {
		status, msg := mapTransferListError(err)
		if status == http.StatusInternalServerError {
			log.Printf("level=error component=api endpoint=get_transfer_list outcome=failed owner_id=%s list_id=%s err=%v", ownerID, listID, err)
		}
		h.writeError(w, status, msg)
		return
	}

	h.writeJSON(w, http.StatusOK, result)
}

func (h *TransactionHandlers) UpdateTransferListHandler(w http.ResponseWriter, r *http.Request) {
	ownerID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	listID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid list ID")
		return
	}

	var payload domain.UpdateTransferListPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request payload.")
		return
	}

	result, err := h.service.UpdateTransferList(r.Context(), ownerID, listID, payload)
	if err != nil {
		status, msg := mapTransferListError(err)
		if status == http.StatusInternalServerError {
			log.Printf("level=error component=api endpoint=update_transfer_list outcome=failed owner_id=%s list_id=%s err=%v", ownerID, listID, err)
		}
		h.writeError(w, status, msg)
		return
	}

	h.writeJSON(w, http.StatusOK, result)
}

func (h *TransactionHandlers) DeleteTransferListHandler(w http.ResponseWriter, r *http.Request) {
	ownerID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	listID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid list ID")
		return
	}

	deleted, err := h.service.DeleteTransferList(r.Context(), ownerID, listID)
	if err != nil {
		log.Printf("level=error component=api endpoint=delete_transfer_list outcome=failed owner_id=%s list_id=%s err=%v", ownerID, listID, err)
		h.writeError(w, http.StatusInternalServerError, "Could not delete transfer list.")
		return
	}
	if !deleted {
		h.writeError(w, http.StatusNotFound, "Transfer list not found.")
		return
	}

	h.writeJSON(w, http.StatusNoContent, nil)
}

func (h *TransactionHandlers) ToggleTransferListMemberHandler(w http.ResponseWriter, r *http.Request) {
	ownerID, statusCode, message := h.resolveAuthenticatedInternalUserID(r)
	if statusCode != 0 {
		h.writeError(w, statusCode, message)
		return
	}

	listID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid list ID")
		return
	}

	var payload domain.ToggleTransferListMemberPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request payload.")
		return
	}

	result, err := h.service.ToggleTransferListMember(r.Context(), ownerID, listID, payload.Username)
	if err != nil {
		status, msg := mapTransferListError(err)
		if status == http.StatusInternalServerError {
			log.Printf("level=error component=api endpoint=toggle_transfer_list_member outcome=failed owner_id=%s list_id=%s err=%v", ownerID, listID, err)
		}
		h.writeError(w, status, msg)
		return
	}

	h.writeJSON(w, http.StatusOK, result)
}
