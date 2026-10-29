package site

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAssemblyAndIndependentDevelopment(t *testing.T) {
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	entries, err := Catalogue(root)
	if err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(t.TempDir(), "assembled")
	if err := Assemble(root, dest); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"index.html", "experiences.json", "shared/hal9k-logo.svg"} {
		if _, err := os.Stat(filepath.Join(dest, path)); err != nil {
			t.Fatal(err)
		}
	}
	for _, entry := range entries {
		if _, err := os.Stat(filepath.Join(dest, "experiences", entry.ID, "index.html")); err != nil {
			t.Fatal(err)
		}
		handler, err := Live(root, entry.ID)
		if err != nil {
			t.Fatal(err)
		}
		for _, path := range []string{"/", "/app.js", "/signup-client.js", "/shared/hal9k-logo.svg", "/experiences/" + entry.ID + "/"} {
			res := httptest.NewRecorder()
			handler.ServeHTTP(res, httptest.NewRequest("GET", path, nil))
			if res.Code != 200 {
				t.Errorf("%s %s: %d", entry.ID, path, res.Code)
			}
		}
		err = filepath.WalkDir(filepath.Join(root, entry.Project, "public"), func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				return nil
			}
			if !strings.HasSuffix(path, ".js") && !strings.HasSuffix(path, ".html") && !strings.HasSuffix(path, ".css") {
				return nil
			}
			data, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			for _, other := range entries {
				if other.ID != entry.ID && strings.Contains(string(data), "/experiences/"+other.ID+"/") {
					t.Errorf("%s imports %s: %s", entry.ID, other.ID, path)
				}
			}
			if strings.Contains(string(data), "/shared/signup-client.js") {
				t.Errorf("%s still depends on shared frontend implementation", entry.ID)
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
}

func TestRejectsInvalidCatalogue(t *testing.T) {
	for _, body := range []string{`[]`, `[{"id":"../bad","title":"x","project":"x"}]`, `[{"id":"ok","title":"x","project":"../outside"}]`} {
		root := t.TempDir()
		if err := os.WriteFile(filepath.Join(root, "experiences.json"), []byte(body), 0644); err != nil {
			t.Fatal(err)
		}
		if _, err := Catalogue(root); err == nil {
			t.Errorf("accepted invalid catalogue: %s", body)
		}
	}
}

func TestSelectedProjectDoesNotNeedOtherProjects(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "experiences/only/public")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("Only project"), 0644); err != nil {
		t.Fatal(err)
	}
	manifest := `[{"id":"only","title":"Only","project":"experiences/only"},{"id":"absent","title":"Absent","project":"experiences/absent"}]`
	if err := os.WriteFile(filepath.Join(root, "experiences.json"), []byte(manifest), 0644); err != nil {
		t.Fatal(err)
	}
	handler, err := Live(root, "only")
	if err != nil {
		t.Fatal(err)
	}
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, httptest.NewRequest("GET", "/", nil))
	if res.Code != 200 || !strings.Contains(res.Body.String(), "Only project") {
		t.Fatal("selected project unavailable")
	}
	if _, err := Live(root, ""); err == nil {
		t.Fatal("complete development host should reject missing project")
	}
}
