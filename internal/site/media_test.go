package site

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestVMBinaryMediaIsNotSniffedOrTransformed(t *testing.T) {
	// Reproduce a disk sector that Go would otherwise serve as text/html.
	data := []byte("<!DOCTYPE html><html><body>Guest disk data</body></html>")
	data = append(data, bytes.Repeat([]byte{' '}, 262144-len(data))...)
	for _, project := range []string{"", "windows98"} {
		prefix := "/experiences/windows98/"
		if project != "" {
			prefix = "/"
		}
		for _, asset := range []string{"publishing/release/disk/0-262144.img", "cds/disc/disk/0-262144.iso", "images/bios.bin", "publishing/release/state.bin.zst"} {
			files := fstest.MapFS{strings.TrimPrefix(prefix+asset, "/"): &fstest.MapFile{Data: data}}
			handler := Headers(http.FileServer(http.FS(files)), project)
			for _, method := range []string{"GET", "HEAD"} {
				for _, partial := range []bool{false, true} {
					req := httptest.NewRequest(method, prefix+asset, nil)
					want, body := http.StatusOK, data
					if partial {
						req.Header.Set("Range", "bytes=0-511")
						want, body = http.StatusPartialContent, data[:512]
					}
					res := httptest.NewRecorder()
					handler.ServeHTTP(res, req)
					if res.Code != want {
						t.Fatalf("%s %s: status %d", method, req.URL, res.Code)
					}
					if got := res.Header().Get("Content-Type"); got != "application/octet-stream" {
						t.Fatalf("%s: Content-Type %q", req.URL, got)
					}
					if got := res.Header().Get("Cache-Control"); got != "no-transform" {
						t.Fatalf("%s: Cache-Control %q", req.URL, got)
					}
					if method == "HEAD" {
						body = nil
					}
					if !bytes.Equal(res.Body.Bytes(), body) {
						t.Fatalf("%s %s: media bytes changed", method, req.URL)
					}
				}
			}
		}
	}
}

func TestBinaryMediaPolicyDoesNotAffectOtherAssets(t *testing.T) {
	for _, asset := range []string{"/experiences/windows98/cds/disc/disc.jpg", "/experiences/windows98/app.js", "/experiences/windows98/publishing/release/manifest.json", "/experiences/other/disk.img", "/api/data.bin"} {
		res := httptest.NewRecorder()
		Headers(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if w.Header().Get("Content-Type") != "" || w.Header().Get("Cache-Control") != "" {
				t.Errorf("unexpected media policy for %s", asset)
			}
		})).ServeHTTP(res, httptest.NewRequest("GET", asset, nil))
	}
}
