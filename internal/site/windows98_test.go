package site

import (
	"os"
	"path/filepath"
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
	for _, pointer := range []string{`{"manifest":"../outside"}`, `{"manifest":"publishing/missing/manifest.json"}`, `{bad`} {
		os.WriteFile(filepath.Join(source, "images/published.json"), []byte(pointer), 0644)
		if err := copyWindows98(source, t.TempDir()); err == nil {
			t.Errorf("accepted bad pointer %s", pointer)
		}
	}
}
