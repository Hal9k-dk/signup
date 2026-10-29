package api

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
)

func validSignup() signup {
	return signup{FirstName: "Ada", LastName: "Lovelace", Email: "ada@example.com", Street: "Testvej 42", PostalCode: "2200", City: "København N", BirthDate: "10-12-1990", Phone: "+45 12345678", Membership: "ordinary", Message: "PROSA: 1234"}
}

func TestSignupValidation(t *testing.T) {
	for _, tc := range []struct {
		name   string
		change func(*signup)
		field  string
	}{
		{"missing name", func(s *signup) { s.FirstName = "  " }, "firstName"},
		{"email", func(s *signup) { s.Email = "not-an-email" }, "email"},
		{"display name email", func(s *signup) { s.Email = "Ada <ada@example.com>" }, "email"},
		{"postal code", func(s *signup) { s.PostalCode = "ABCD" }, "postalCode"},
		{"impossible date", func(s *signup) { s.BirthDate = "31-02-2000" }, "birthDate"},
		{"date format", func(s *signup) { s.BirthDate = "1-01-2000" }, "birthDate"},
		{"future date", func(s *signup) { s.BirthDate = "01-01-2999" }, "birthDate"},
		{"membership", func(s *signup) { s.Membership = "robot" }, "membership"},
		{"message size", func(s *signup) { s.Message = strings.Repeat("x", 4001) }, "message"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := validSignup()
			tc.change(&s)
			if s.validate()[tc.field] == "" {
				t.Errorf("expected error on %s", tc.field)
			}
		})
	}
	if errs := validSignup().validate(); len(errs) != 0 {
		t.Fatalf("valid signup rejected: %v", errs)
	}
	s := validSignup()
	s.Membership = "student"
	if errs := s.validate(); len(errs) != 0 {
		t.Fatalf("student signup rejected: %v", errs)
	}
}

func TestSignupAPI(t *testing.T) {
	payload, err := json.Marshal(validSignup())
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, method, contentType, body string
		status                          int
	}{
		{"valid", "POST", "application/json", string(payload), 200},
		{"charset", "POST", "application/json; charset=utf-8", string(payload), 200},
		{"missing fields", "POST", "application/json", "{}", 422},
		{"invalid JSON", "POST", "application/json", "{", 400},
		{"unknown field", "POST", "application/json", `{"secret":true}`, 400},
		{"trailing data", "POST", "application/json", string(payload) + " {}", 400},
		{"oversized", "POST", "application/json", `{"message":"` + strings.Repeat("x", 17000) + `"}`, 400},
		{"wrong content type", "POST", "text/plain", string(payload), 415},
		{"wrong method", "DELETE", "application/json", "", 405},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var logs bytes.Buffer
			handler := NewHandler(slog.New(slog.NewJSONHandler(&logs, nil)))
			req := httptest.NewRequest(tc.method, "/api/signup", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", tc.contentType)
			res := httptest.NewRecorder()
			handler.ServeHTTP(res, req)
			if res.Code != tc.status {
				t.Fatalf("got %d, want %d: %s", res.Code, tc.status, res.Body.String())
			}
			if tc.status == 200 {
				if !strings.Contains(logs.String(), `"firstName":"Ada"`) || !strings.Contains(logs.String(), `"message":"PROSA: 1234"`) {
					t.Fatal("signup fields were not logged")
				}
			} else if logs.Len() != 0 {
				t.Fatal("invalid signup was logged")
			}
		})
	}
}
