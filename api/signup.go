package api

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/mail"
	"os"
	"strings"
	"time"
)

type signup struct {
	FirstName  string `json:"firstName"`
	LastName   string `json:"lastName"`
	Email      string `json:"email"`
	Street     string `json:"street"`
	PostalCode string `json:"postalCode"`
	City       string `json:"city"`
	BirthDate  string `json:"birthDate"`
	Phone      string `json:"phone"`
	Membership string `json:"membership"`
	Message    string `json:"message"`
}

func (s signup) validate() map[string]string {
	errs := make(map[string]string)
	for key, value := range map[string]string{
		"firstName": s.FirstName, "lastName": s.LastName, "email": s.Email,
		"street": s.Street, "postalCode": s.PostalCode, "city": s.City,
		"birthDate": s.BirthDate, "phone": s.Phone,
	} {
		if strings.TrimSpace(value) == "" {
			errs[key] = "Dette felt skal udfyldes."
		} else if len(value) > 256 {
			errs[key] = "Brug højst 256 tegn."
		}
	}
	if addr, err := mail.ParseAddress(s.Email); err != nil || addr.Address != s.Email {
		errs["email"] = "Indtast en gyldig emailadresse."
	}
	if len(s.PostalCode) != 4 || strings.IndexFunc(s.PostalCode, func(r rune) bool { return r < '0' || r > '9' }) >= 0 {
		errs["postalCode"] = "Indtast et firecifret postnummer."
	}
	date, err := time.Parse("02-01-2006", s.BirthDate)
	if err != nil || date.Format("02-01-2006") != s.BirthDate || date.After(time.Now()) {
		errs["birthDate"] = "Brug en gyldig fødselsdato i formatet dd-mm-yyyy."
	}
	if s.Membership != "ordinary" && s.Membership != "student" {
		errs["membership"] = "Vælg en medlemstype."
	}
	if len(s.Message) > 4000 {
		errs["message"] = "Beskeden må højst fylde 4000 bytes."
	}
	return errs
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func signupHandler(logger *slog.Logger, notify signupNotifier) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if contentType := strings.Split(r.Header.Get("Content-Type"), ";")[0]; contentType != "application/json" {
			writeJSON(w, http.StatusUnsupportedMediaType, map[string]string{"error": "Forventede JSON."})
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		var input signup
		if err := decoder.Decode(&input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Ugyldige formulardata."})
			return
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Forventede ét JSON-objekt."})
			return
		}
		if errs := input.validate(); len(errs) > 0 {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "Kontrollér felterne.", "fields": errs})
			return
		}
		// Retain the signup audit log; restrict access and retention of personal data.
		logger.Info("signup received", "signup", input)
		message := "Modtaget i udviklingstilstand. Slack er ikke konfigureret, så indmeldelsen er kun logget."
		if notify != nil {
			if err := notify(r.Context(), input); err != nil {
				logger.Error("signup Slack notification failed", "error", err)
				writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Din tilmelding kunne ikke sendes. Prøv igen senere."})
				return
			}
			message = "Modtaget! Din tilmelding er sendt til foreningen."
		}
		writeJSON(w, http.StatusOK, map[string]string{"message": message})
	}
}

// NewHandler serves only the shared signup API.
func NewHandler(logger *slog.Logger) http.Handler {
	var notify signupNotifier
	if webhook := strings.TrimSpace(os.Getenv("SLACK_WEBHOOK_URL")); webhook != "" {
		notify = configuredSlackNotifier(webhook)
	} else {
		logger.Warn("SLACK_WEBHOOK_URL is not set; signups will only be logged")
	}
	return newHandler(logger, notify)
}

func newHandler(logger *slog.Logger, notify signupNotifier) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/signup", signupHandler(logger, notify))
	return mux
}
