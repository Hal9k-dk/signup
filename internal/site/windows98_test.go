package site

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWindows98ProductionSelection(t *testing.T) {
	source := t.TempDir()
	dest := filepath.Join(t.TempDir(), "output")
	files := map[string]string{
		"index.html": "VM", "app.js": "frontend", "vendor/v86.wasm": "wasm", "seabios.bin": "bios", "downloads/hal9k-test.iso": "CD",
		"images/published.json": `{"manifest":"publishing/selected/manifest.json"}`,
		"images/disk.img":       "raw", "images/state.bin": "raw state", "images/handover.json": "raw metadata",
		"publishing/selected/manifest.json": `{"format":"hal9k-windows98-publish-v1","disk_backend":"async-parts-with-overlay","asset_root":"publishing/selected/","state":"publishing/selected/state.bin.zst"}`,
		"publishing/selected/state.bin.zst": "snapshot", "publishing/selected/disk/0-262144.img": "chunk",
		"publishing/selected/pointer.json": "redundant", "publishing/selected/disk.img": "raw",
		"publishing/old/state.bin.zst": "old", "publishing/draft.json": "draft", "publishing/draft/disk/0-262144.img": "draft chunk",
	}
	for name, data := range files {
		p := filepath.Join(source, name)
		if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(data), 0644); err != nil {
			t.Fatal(err)
		}
	}
	if err := copyWindows98(source, dest); err != nil {
		t.Fatal(err)
	}
	allowed := map[string]bool{"index.html": true, "app.js": true, "vendor/v86.wasm": true, "seabios.bin": true, "downloads/hal9k-test.iso": true, "images/published.json": true, "publishing/selected/manifest.json": true, "publishing/selected/state.bin.zst": true, "publishing/selected/disk/0-262144.img": true}
	for name, data := range files {
		got, err := os.ReadFile(filepath.Join(dest, name))
		if allowed[name] {
			if err != nil || string(got) != data {
				t.Errorf("required file %s: %v", name, err)
			}
		} else if !os.IsNotExist(err) {
			t.Errorf("excluded file packaged: %s", name)
		}
		if _, err := os.Stat(filepath.Join(source, name)); err != nil {
			t.Errorf("source altered: %s", name)
		}
	}
	// Split container layers must reconstruct exactly the full assembly.
	if err := os.MkdirAll(filepath.Join(source, "cds/disc/disk"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "cds/disc/disk/0-262144.iso"), []byte("CD chunk"), 0644); err != nil {
		t.Fatal(err)
	}
	files["cds/disc/disk/0-262144.iso"] = "CD chunk"
	web, media := t.TempDir(), t.TempDir()
	if err := copyWindows98Filtered(source, web, "web"); err != nil {
		t.Fatal(err)
	}
	if err := copyWindows98Filtered(source, media, "media"); err != nil {
		t.Fatal(err)
	}
	allowed["cds/disc/disk/0-262144.iso"] = true
	for name, data := range files {
		webData, webErr := os.ReadFile(filepath.Join(web, name))
		mediaData, mediaErr := os.ReadFile(filepath.Join(media, name))
		if !allowed[name] {
			if !os.IsNotExist(webErr) || !os.IsNotExist(mediaErr) {
				t.Errorf("excluded file in split layers: %s", name)
			}
			continue
		}
		isMedia := strings.HasPrefix(name, "publishing/") || strings.HasPrefix(name, "cds/")
		if isMedia {
			if mediaErr != nil || string(mediaData) != data || !os.IsNotExist(webErr) {
				t.Errorf("bad media layer: %s", name)
			}
		} else if webErr != nil || string(webData) != data {
			t.Errorf("bad web layer: %s", name)
		}
	}
	for _, pointer := range []string{`{"manifest":"../outside"}`, `{"manifest":"publishing/missing/manifest.json"}`, `{bad`} {
		os.WriteFile(filepath.Join(source, "images/published.json"), []byte(pointer), 0644)
		if err := copyWindows98(source, t.TempDir()); err == nil {
			t.Errorf("accepted bad pointer %s", pointer)
		}
	}
}
