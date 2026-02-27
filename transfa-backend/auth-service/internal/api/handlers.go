package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/transfa/auth-service/internal/domain"
	"github.com/transfa/auth-service/internal/store"
)

var (
	bvnPattern   = regexp.MustCompile(`^[0-9]{11}$`)
	phonePattern = regexp.MustCompile(`^0[0-9]{10}$`)
)

// OnboardingHandler handles the user onboarding process.
type OnboardingHandler struct {
	repo store.UserRepository
}

// NewOnboardingHandler creates a new handler for the onboarding endpoint.
func NewOnboardingHandler(repo store.UserRepository) *OnboardingHandler {
	return &OnboardingHandler{repo: repo}
}

// HandleTier2 receives BVN/DOB/Gender and records onboarding_status (tier2 -> pending). Returns 202.
func (h *OnboardingHandler) HandleTier2(w http.ResponseWriter, r *http.Request) {
	clerkUserID, ok := GetClerkUserID(r.Context())
	if !ok || strings.TrimSpace(clerkUserID) == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	existing, err := h.repo.FindByClerkUserID(r.Context(), clerkUserID)
	if err != nil || existing == nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	if existing.AnchorCustomerID == nil || *existing.AnchorCustomerID == "" {
		http.Error(w, "Tier 1 verification incomplete", http.StatusPreconditionFailed)
		return
	}

	var body struct {
		Dob    string `json:"dob"`
		Gender string `json:"gender"`
		Bvn    string `json:"bvn"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	body.Dob = strings.TrimSpace(body.Dob)
	body.Gender = strings.TrimSpace(body.Gender)
	body.Bvn = strings.TrimSpace(body.Bvn)

	if body.Dob == "" || body.Gender == "" || body.Bvn == "" {
		http.Error(w, "BVN, date of birth and gender are required", http.StatusBadRequest)
		return
	}
	if !bvnPattern.MatchString(body.Bvn) {
		http.Error(w, "BVN must be exactly 11 digits", http.StatusBadRequest)
		return
	}

	normalizedDOB, dobErr := normalizeDateOfBirth(body.Dob)
	if dobErr != nil {
		http.Error(w, dobErr.Error(), http.StatusBadRequest)
		return
	}

	genderLower := strings.ToLower(body.Gender)
	switch genderLower {
	case "male", "female":
	default:
		http.Error(w, "Gender must be 'male' or 'female'", http.StatusBadRequest)
		return
	}
	normalizedGender := strings.ToUpper(genderLower[:1]) + genderLower[1:]

	event := domain.Tier2VerificationRequestedEvent{
		UserID:           existing.ID,
		AnchorCustomerID: *existing.AnchorCustomerID,
		BVN:              body.Bvn,
		DateOfBirth:      normalizedDOB,
		Gender:           normalizedGender,
	}
	if err := h.repo.UpsertOnboardingStatusAndEnqueueEvent(
		r.Context(),
		existing.ID,
		"tier2",
		"pending",
		nil,
		"customer_events",
		"tier2.verification.requested",
		event,
	); err != nil {
		http.Error(w, "Failed to queue tier2 verification", http.StatusInternalServerError)
		return
	}
	_ = h.repo.ClearOnboardingProgress(r.Context(), clerkUserID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "tier2_processing"})
}

// HandleTier1Update updates a previously created Anchor customer profile data (name/address/contact)
// so the user can resolve mismatches and retry Tier2 verification safely.
func (h *OnboardingHandler) HandleTier1Update(w http.ResponseWriter, r *http.Request) {
	clerkUserID, ok := GetClerkUserID(r.Context())
	if !ok || strings.TrimSpace(clerkUserID) == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	existing, err := h.repo.FindByClerkUserID(r.Context(), clerkUserID)
	if err != nil || existing == nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	if existing.AnchorCustomerID == nil || strings.TrimSpace(*existing.AnchorCustomerID) == "" {
		http.Error(w, "Tier 1 verification incomplete", http.StatusPreconditionFailed)
		return
	}

	var req domain.OnboardingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	authEmail, err := resolveOnboardingEmail(r, req.Email)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req.Email = authEmail

	if err := normalizeAndValidateOnboardingRequest(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.UserType != domain.PersonalUser {
		http.Error(w, "tier1 profile updates are currently supported for personal accounts only", http.StatusBadRequest)
		return
	}

	var fullName *string
	if value, ok := req.KYCData["fullName"].(string); ok && strings.TrimSpace(value) != "" {
		trimmed := strings.TrimSpace(value)
		fullName = &trimmed
	}

	eventKYC := map[string]interface{}{}
	for k, v := range req.KYCData {
		eventKYC[k] = v
	}
	eventKYC["email"] = req.Email
	eventKYC["phoneNumber"] = req.PhoneNumber
	eventKYC["userType"] = string(req.UserType)

	event := domain.Tier1ProfileUpdateRequestedEvent{
		UserID:           existing.ID,
		AnchorCustomerID: *existing.AnchorCustomerID,
		KYCData:          eventKYC,
	}
	if err := h.repo.UpdateTier1ProfileAndEnqueueEvent(
		r.Context(),
		existing.ID,
		&req.Email,
		&req.PhoneNumber,
		fullName,
		"tier1",
		"processing",
		nil,
		"user_events",
		"user.tier1.update.requested",
		event,
	); err != nil {
		http.Error(w, "Failed to process tier1 update", http.StatusInternalServerError)
		return
	}
	_ = h.repo.UpsertOnboardingProgress(
		r.Context(),
		clerkUserID,
		&existing.ID,
		string(req.UserType),
		3,
		eventKYC,
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "tier1_update_processing"})
}

// ServeHTTP implements the http.Handler interface.
func (h *OnboardingHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	clerkUserID, ok := GetClerkUserID(r.Context())
	if !ok || strings.TrimSpace(clerkUserID) == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req domain.OnboardingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	authEmail, err := resolveOnboardingEmail(r, req.Email)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req.Email = authEmail

	if err := normalizeAndValidateOnboardingRequest(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	eventKYC := map[string]interface{}{}
	for k, v := range req.KYCData {
		eventKYC[k] = v
	}
	eventKYC["email"] = req.Email
	eventKYC["phoneNumber"] = req.PhoneNumber
	eventKYC["userType"] = string(req.UserType)

	var internalUserID string
	existing, findErr := h.repo.FindByClerkUserID(r.Context(), clerkUserID)
	if findErr != nil && !errors.Is(findErr, pgx.ErrNoRows) {
		http.Error(w, "Internal server error: could not lookup user", http.StatusInternalServerError)
		return
	}
	if findErr == nil && existing != nil {
		internalUserID = existing.ID

		if existing.AnchorCustomerID != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"user_id":            existing.ID,
				"anchor_customer_id": existing.AnchorCustomerID,
				"status":             "tier1_already_created",
			})
			return
		}

		var fullName *string
		if req.UserType == domain.PersonalUser {
			if value, ok := req.KYCData["fullName"].(string); ok && strings.TrimSpace(value) != "" {
				trimmed := strings.TrimSpace(value)
				fullName = &trimmed
			}
		}
		if err := h.repo.UpdateUserProfileAndEnqueueUserCreatedEvent(
			r.Context(),
			existing.ID,
			&req.Email,
			&req.PhoneNumber,
			fullName,
			eventKYC,
			"user_events",
			"user.created",
		); err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				http.Error(w, "Conflict: user data already exists", http.StatusConflict)
				return
			}
			http.Error(w, "Internal server error: could not queue onboarding", http.StatusInternalServerError)
			return
		}
	} else {
		var fullName *string
		if v, ok := req.KYCData["fullName"].(string); ok && v != "" {
			fullName = &v
		}

		newUser := domain.User{
			ClerkUserID:  clerkUserID,
			Username:     nil,
			Email:        &req.Email,
			PhoneNumber:  &req.PhoneNumber,
			FullName:     fullName,
			Type:         req.UserType,
			AllowSending: req.UserType == domain.PersonalUser,
		}

		createdID, err := h.repo.CreateUserAndEnqueueUserCreatedEvent(
			r.Context(),
			&newUser,
			eventKYC,
			"user_events",
			"user.created",
		)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				http.Error(w, "Conflict: user data already exists", http.StatusConflict)
				return
			}
			http.Error(w, "Internal server error: could not create user", http.StatusInternalServerError)
			return
		}
		internalUserID = createdID
	}

	_ = h.repo.UpsertOnboardingProgress(
		r.Context(),
		clerkUserID,
		&internalUserID,
		string(req.UserType),
		3,
		eventKYC,
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]string{"user_id": internalUserID, "status": "tier1_processing"})
}

// HandleSaveProgress persists onboarding draft step so users can resume after logout/re-login.
func (h *OnboardingHandler) HandleSaveProgress(w http.ResponseWriter, r *http.Request) {
	clerkUserID, ok := GetClerkUserID(r.Context())
	if !ok || strings.TrimSpace(clerkUserID) == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		UserType    string                 `json:"user_type"`
		CurrentStep int                    `json:"current_step"`
		Payload     map[string]interface{} `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	body.UserType = strings.ToLower(strings.TrimSpace(body.UserType))
	if body.UserType == "" {
		body.UserType = "personal"
	}
	if body.UserType != "personal" && body.UserType != "merchant" {
		http.Error(w, "user_type must be 'personal' or 'merchant'", http.StatusBadRequest)
		return
	}
	if body.CurrentStep < 1 || body.CurrentStep > 3 {
		http.Error(w, "current_step must be between 1 and 3", http.StatusBadRequest)
		return
	}

	var internalUserID *string
	existing, err := h.repo.FindByClerkUserID(r.Context(), clerkUserID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "Failed to resolve user context", http.StatusInternalServerError)
		return
	}
	if existing != nil {
		internalUserID = &existing.ID
	}

	if err := h.repo.UpsertOnboardingProgress(
		r.Context(),
		clerkUserID,
		internalUserID,
		body.UserType,
		body.CurrentStep,
		body.Payload,
	); err != nil {
		http.Error(w, "Failed to save onboarding progress", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// HandleClearProgress removes onboarding draft state once onboarding has been submitted.
func (h *OnboardingHandler) HandleClearProgress(w http.ResponseWriter, r *http.Request) {
	clerkUserID, ok := GetClerkUserID(r.Context())
	if !ok || strings.TrimSpace(clerkUserID) == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if err := h.repo.ClearOnboardingProgress(r.Context(), clerkUserID); err != nil {
		http.Error(w, "Failed to clear onboarding progress", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func normalizeAndValidateOnboardingRequest(req *domain.OnboardingRequest) error {
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.PhoneNumber = normalizePhone(strings.TrimSpace(req.PhoneNumber))
	if req.KYCData == nil {
		req.KYCData = map[string]interface{}{}
	}

	normalizedUserType := domain.UserType(strings.ToLower(strings.TrimSpace(string(req.UserType))))
	if normalizedUserType == "" {
		return errors.New("user_type is required")
	}
	if normalizedUserType != domain.PersonalUser && normalizedUserType != domain.MerchantUser {
		return errors.New("user_type must be either 'personal' or 'merchant'")
	}
	if req.Email == "" || req.PhoneNumber == "" {
		return errors.New("email and phone_number are required")
	}
	if _, err := mail.ParseAddress(req.Email); err != nil {
		return errors.New("email must be a valid email address")
	}
	if !phonePattern.MatchString(req.PhoneNumber) {
		return errors.New("phone_number must be a valid Nigerian phone number (e.g. 07012345678)")
	}

	req.UserType = normalizedUserType
	if req.UserType == domain.PersonalUser {
		validatedKYC, fullName, err := validatePersonalTier1ProfileKYC(req.KYCData)
		if err != nil {
			return err
		}
		validatedKYC["fullName"] = fullName
		req.KYCData = validatedKYC
		return nil
	}

	validatedKYC, err := validateMerchantBasicKYC(req.KYCData)
	if err != nil {
		return err
	}
	req.KYCData = validatedKYC
	return nil
}

func resolveOnboardingEmail(r *http.Request, bodyEmail string) (string, error) {
	contextEmail := ""
	if email, ok := GetClerkUserEmail(r.Context()); ok {
		contextEmail = strings.ToLower(strings.TrimSpace(email))
	}

	headerEmail := strings.ToLower(strings.TrimSpace(r.Header.Get("X-User-Email")))
	requestEmail := strings.ToLower(strings.TrimSpace(bodyEmail))

	authoritativeEmail := contextEmail
	if authoritativeEmail == "" {
		authoritativeEmail = headerEmail
	}
	if authoritativeEmail == "" {
		return "", errors.New("authenticated email is required")
	}

	if requestEmail != "" && requestEmail != authoritativeEmail {
		return "", errors.New("email must match the authenticated sign-in email")
	}

	if _, err := mail.ParseAddress(authoritativeEmail); err != nil {
		return "", errors.New("authenticated email must be a valid email address")
	}

	return authoritativeEmail, nil
}

func normalizeDateOfBirth(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", errors.New("date of birth is required")
	}

	layouts := []string{"2006-01-02", "02/01/2006", "02-01-2006", "2006/01/02"}
	var parsed time.Time
	var err error
	for _, layout := range layouts {
		parsed, err = time.Parse(layout, trimmed)
		if err == nil {
			break
		}
	}
	if err != nil {
		return "", errors.New("date of birth must be in YYYY-MM-DD or DD/MM/YYYY format")
	}

	now := time.Now().UTC()
	if parsed.After(now) {
		return "", errors.New("date of birth cannot be in the future")
	}
	if parsed.Year() < 1900 {
		return "", errors.New("date of birth is invalid")
	}

	age := now.Year() - parsed.Year()
	if now.YearDay() < parsed.YearDay() {
		age--
	}
	if age < 18 {
		return "", errors.New("you must be at least 18 years old")
	}

	return parsed.Format("2006-01-02"), nil
}

func validatePersonalTier1ProfileKYC(raw map[string]interface{}) (map[string]interface{}, string, error) {
	firstName, err := requiredString(raw, "firstName")
	if err != nil {
		return nil, "", errors.New("firstName is required")
	}
	lastName, err := requiredString(raw, "lastName")
	if err != nil {
		return nil, "", errors.New("lastName is required")
	}
	addressLine1, err := requiredString(raw, "addressLine1")
	if err != nil {
		return nil, "", errors.New("addressLine1 is required")
	}
	city, err := requiredString(raw, "city")
	if err != nil {
		return nil, "", errors.New("city is required")
	}
	state, err := requiredString(raw, "state")
	if err != nil {
		return nil, "", errors.New("state is required")
	}
	country, err := requiredString(raw, "country")
	if err != nil {
		return nil, "", errors.New("country is required")
	}
	postalCode, err := requiredString(raw, "postalCode")
	if err != nil {
		return nil, "", errors.New("postalCode is required")
	}

	middleName := optionalString(raw, "middleName")
	maidenName := optionalString(raw, "maidenName")
	addressLine2 := optionalString(raw, "addressLine2")

	fullNameParts := []string{firstName}
	if middleName != "" {
		fullNameParts = append(fullNameParts, middleName)
	}
	fullNameParts = append(fullNameParts, lastName)
	if maidenName != "" {
		fullNameParts = append(fullNameParts, "("+maidenName+")")
	}
	fullName := strings.Join(fullNameParts, " ")

	result := map[string]interface{}{
		"firstName":    firstName,
		"lastName":     lastName,
		"addressLine1": addressLine1,
		"city":         city,
		"state":        state,
		"postalCode":   postalCode,
		"country":      strings.ToUpper(country),
	}
	if middleName != "" {
		result["middleName"] = middleName
	}
	if maidenName != "" {
		result["maidenName"] = maidenName
	}
	if addressLine2 != "" {
		result["addressLine2"] = addressLine2
	}

	return result, fullName, nil
}

func validateMerchantBasicKYC(raw map[string]interface{}) (map[string]interface{}, error) {
	businessName, err := requiredString(raw, "businessName")
	if err != nil {
		return nil, errors.New("businessName is required")
	}
	rcNumber, err := requiredString(raw, "rcNumber")
	if err != nil {
		return nil, errors.New("rcNumber is required")
	}
	return map[string]interface{}{
		"businessName": businessName,
		"rcNumber":     rcNumber,
	}, nil
}

func requiredString(data map[string]interface{}, key string) (string, error) {
	value := optionalString(data, key)
	if value == "" {
		return "", fmt.Errorf("%s is required", key)
	}
	return value, nil
}

func optionalString(data map[string]interface{}, key string) string {
	value, _ := data[key].(string)
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	return strings.Join(strings.Fields(trimmed), " ")
}

func normalizePhone(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}

	var b strings.Builder
	for _, ch := range trimmed {
		if ch >= '0' && ch <= '9' {
			b.WriteRune(ch)
		}
	}

	digits := b.String()
	if strings.HasPrefix(digits, "2340") && len(digits) == 14 {
		digits = digits[3:]
	} else if strings.HasPrefix(digits, "234") && len(digits) == 13 {
		digits = "0" + digits[3:]
	} else if len(digits) == 10 {
		digits = "0" + digits
	}

	return digits
}
