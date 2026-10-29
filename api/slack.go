package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// Notifications run synchronously: success means Slack accepted the request.
// Never return transport errors verbatim: they can contain the secret URL.
type signupNotifier func(context.Context, signup) error

func slackNotifier(webhook string, client *http.Client) signupNotifier {
	return func(ctx context.Context, input signup) error {
		text := fmt.Sprintf("New signup\nName: %s %s\nEmail: %s\nAddress: %s, %s %s\nBirth date: %s\nPhone: %s\nMembership: %s\nMessage: %s",
			input.FirstName, input.LastName, input.Email, input.Street, input.PostalCode,
			input.City, input.BirthDate, input.Phone, input.Membership, input.Message)
		payload, err := json.Marshal(struct {
			Text   string `json:"text"`
			Mrkdwn bool   `json:"mrkdwn"`
			Parse  string `json:"parse"`
		}{Text: text, Mrkdwn: false, Parse: "none"})
		if err != nil {
			return errors.New("could not encode Slack notification")
		}
		ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhook, bytes.NewReader(payload))
		if err != nil {
			return errors.New("invalid Slack webhook configuration")
		}
		req.Header.Set("Content-Type", "application/json")
		res, err := client.Do(req)
		if err != nil {
			return errors.New("Slack webhook request failed")
		}
		defer res.Body.Close()
		// Bound reads and do not log Slack's response body or the webhook URL.
		_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 4096))
		if res.StatusCode < 200 || res.StatusCode >= 300 {
			return fmt.Errorf("Slack webhook returned status %d", res.StatusCode)
		}
		return nil
	}
}

func configuredSlackNotifier(webhook string) signupNotifier {
	u, err := url.Parse(webhook)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil {
		return func(context.Context, signup) error {
			return errors.New("SLACK_WEBHOOK_URL must be an HTTPS URL")
		}
	}
	return slackNotifier(webhook, &http.Client{
		Timeout: 5 * time.Second,
		// Do not forward the secret URL/payload through redirects.
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	})
}
