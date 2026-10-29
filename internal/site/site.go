// Package site assembles independent static projects. It has no knowledge of
// signup UI behaviour, and is used only by development and packaging tools.
package site

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
)

type Experience struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Project string `json:"project"`
}

func Catalogue(root string) ([]Experience, error) {
	data, err := os.ReadFile(filepath.Join(root, "experiences.json"))
	if err != nil {
		return nil, err
	}
	var entries []Experience
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, err
	}
	if len(entries) == 0 {
		return nil, fmt.Errorf("empty experience catalogue")
	}
	seen := map[string]bool{}
	for _, entry := range entries {
		if !regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`).MatchString(entry.ID) || seen[entry.ID] || entry.Title == "" {
			return nil, fmt.Errorf("invalid or duplicate experience: %q", entry.ID)
		}
		seen[entry.ID] = true
		if !filepath.IsLocal(entry.Project) {
			return nil, fmt.Errorf("project must be a relative local path: %s", entry.Project)
		}
	}
	return entries, nil
}

// Live serves the chooser and projects directly from source. Selecting a project
// serves it at / as well as its assembled URL; the others need not be loaded.
func Live(root, project string) (http.Handler, error) {
	entries, err := Catalogue(root)
	if err != nil {
		return nil, err
	}
	mux := http.NewServeMux()
	mux.Handle("GET /shared/", http.StripPrefix("/shared/", http.FileServer(http.Dir(filepath.Join(root, "shared")))))
	mux.Handle("GET /landing/", http.StripPrefix("/landing/", http.FileServer(http.Dir(filepath.Join(root, "landing/public")))))
	mux.HandleFunc("GET /experiences.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(entries)
	})
	selected := "landing/public"
	found := project == ""
	for _, entry := range entries {
		dir := filepath.Join(root, entry.Project, "public")
		prefix := "/experiences/" + entry.ID + "/"
		if project == "" || project == entry.ID {
			if _, err := os.Stat(filepath.Join(dir, "index.html")); err != nil {
				return nil, fmt.Errorf("%s: %w", entry.ID, err)
			}
			mux.Handle("GET "+prefix, http.StripPrefix(prefix, http.FileServer(http.Dir(dir))))
		}
		if project == entry.ID {
			selected = filepath.Join(entry.Project, "public")
			found = true
		}
	}
	if !found {
		return nil, fmt.Errorf("unknown project %q", project)
	}
	mux.Handle("GET /", http.FileServer(http.Dir(filepath.Join(root, selected))))
	return mux, nil
}

// Assemble produces the exact static tree embedded by cmd/server. All present
// projects are static public/ directories; introducing a build tool is optional.
func Assemble(root, dest string) error {
	entries, err := Catalogue(root)
	if err != nil {
		return err
	}
	if err := os.RemoveAll(dest); err != nil {
		return err
	}
	for _, pair := range [][2]string{{"landing/public", ""}, {"shared", "shared"}} {
		if err := copyTree(filepath.Join(root, pair[0]), filepath.Join(dest, pair[1])); err != nil {
			return err
		}
	}
	for _, entry := range entries {
		if _, err := os.Stat(filepath.Join(root, entry.Project, "public", "index.html")); err != nil {
			return fmt.Errorf("%s: %w", entry.ID, err)
		}
		if err := copyTree(filepath.Join(root, entry.Project, "public"), filepath.Join(dest, "experiences", entry.ID)); err != nil {
			return err
		}
	}
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dest, "experiences.json"), data, 0644)
}

func copyTree(source, dest string) error {
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dest, rel)
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("symlinks are not supported: %s", path)
		}
		if entry.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0644)
	})
}

// Headers applies the same browser policy to development and the final binary.
func Headers(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
		next.ServeHTTP(w, r)
	})
}
