// Package site assembles independent static projects. It has no knowledge of
// signup UI behaviour, and is used only by development and packaging tools.
package site

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
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

// Assemble produces the static tree served by cmd/server.
func Assemble(root, dest string) error {
	return assemble(root, dest, false)
}

// AssembleWeb omits immutable VM/CD media, allowing separate container layers.
func AssembleWeb(root, dest string) error {
	return assemble(root, dest, true)
}

func assemble(root, dest string, webOnly bool) error {
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
		source := filepath.Join(root, entry.Project, "public")
		target := filepath.Join(dest, "experiences", entry.ID)
		if entry.ID == "windows98" {
			mode := "all"
			if webOnly {
				mode = "web"
			}
			if err := copyWindows98Filtered(source, target, mode); err != nil {
				return fmt.Errorf("windows98 assembly: %w", err)
			}
		} else if err := copyTree(source, target); err != nil {
			return err
		}
	}
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dest, "experiences.json"), data, 0644)
}

// copyWindows98 packages only the immutable version selected by the pointer.
// Raw authoring masters and alternate versions remain available to Live only.
func copyWindows98(source, dest string) error {
	return copyWindows98Filtered(source, dest, "all")
}

func copyWindows98Filtered(source, dest, mode string) error {
	data, err := os.ReadFile(filepath.Join(source, "images", "published.json"))
	if err != nil {
		return err
	}
	var pointer struct {
		Manifest string `json:"manifest"`
	}
	if err := json.Unmarshal(data, &pointer); err != nil {
		return err
	}
	if !regexp.MustCompile(`^publishing/[A-Za-z0-9_-]+/manifest\.json$`).MatchString(pointer.Manifest) {
		return fmt.Errorf("invalid publishing pointer")
	}
	version := strings.Split(pointer.Manifest, "/")[1]
	manifestPath := filepath.Join(source, filepath.FromSlash(pointer.Manifest))
	data, err = os.ReadFile(manifestPath)
	if err != nil {
		return err
	}
	var manifest struct {
		Format    string `json:"format"`
		Backend   string `json:"disk_backend"`
		State     string `json:"state"`
		AssetRoot string `json:"asset_root"`
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		return err
	}
	assetRoot := "publishing/" + version + "/"
	if manifest.Format != "hal9k-windows98-publish-v1" || manifest.Backend != "async-parts-with-overlay" ||
		manifest.AssetRoot != assetRoot || manifest.State != assetRoot+"state.bin.zst" {
		return fmt.Errorf("selected release is not a finalized lazy snapshot")
	}
	if _, err := os.Stat(filepath.Join(source, filepath.FromSlash(manifest.State))); err != nil {
		return err
	}
	return copyTreeFiltered(source, dest, func(rel string, entry fs.DirEntry) bool {
		rel = filepath.ToSlash(rel)
		if mode == "web" && (rel == "publishing" || rel == "cds") {
			return false
		}
		if rel == "images" {
			return true
		}
		if strings.HasPrefix(rel, "images/") {
			return rel == "images/published.json"
		}
		if rel == "publishing" || rel == "publishing/"+version {
			return true
		}
		if strings.HasPrefix(rel, "publishing/") {
			if rel == pointer.Manifest || rel == manifest.State || rel == assetRoot+"disk" {
				return true
			}
			return strings.HasPrefix(rel, assetRoot+"disk/") && !entry.IsDir() &&
				regexp.MustCompile(`^[0-9]+-[0-9]+\.img$`).MatchString(filepath.Base(rel))
		}
		return mode != "media" || rel == "." || rel == "cds" || strings.HasPrefix(rel, "cds/")
	})
}

// AssembleMedia selects the same matched release as Assemble, without frontend files.
func AssembleMedia(root, dest string) error {
	if err := os.RemoveAll(dest); err != nil {
		return err
	}
	return copyWindows98Filtered(filepath.Join(root, "experiences/windows98/public"),
		filepath.Join(dest, "experiences/windows98"), "media")
}

func copyTree(source, dest string) error {
	return copyTreeFiltered(source, dest, nil)
}

func copyTreeFiltered(source, dest string, include func(string, fs.DirEntry) bool) error {
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		if include != nil && !include(rel, entry) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		target := filepath.Join(dest, rel)
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("symlinks are not supported: %s", path)
		}
		if entry.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		input, err := os.Open(path)
		if err != nil {
			return err
		}
		defer input.Close()
		output, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
		if err != nil {
			return err
		}
		_, err = io.Copy(output, input)
		closeErr := output.Close()
		if err != nil {
			return err
		}
		return closeErr
	})
}

// Headers applies the same browser policy to development and the final binary.
func Headers(next http.Handler, project ...string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		policy := "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
		// Only the VM experience needs Wasm compilation and blob workers.
		// The optional project identifies independent development mode.
		vm := strings.HasPrefix(r.URL.Path, "/experiences/windows98/") ||
			(len(project) > 0 && project[0] == "windows98" && !strings.HasPrefix(r.URL.Path, "/api/"))
		if vm {
			policy += "; worker-src 'self' blob:"
			policy = strings.Replace(policy, "script-src 'self'", "script-src 'self' blob: 'wasm-unsafe-eval'", 1)
		}
		w.Header().Set("Content-Security-Policy", policy)
		next.ServeHTTP(w, r)
	})
}
