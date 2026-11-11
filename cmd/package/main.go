package main

import (
	"flag"
	"fmt"
	"hackerspace/signup/internal/site"
	"os"
	"path/filepath"
)

func main() {
	root := flag.String("root", ".", "repository root")
	output := flag.String("out", "bin/assets", "output directory, relative to root")
	mode := flag.String("mode", "all", "all, web, or media (separate container layers)")
	flag.Parse()
	absolute, err := filepath.Abs(*root)
	if err == nil {
		dest := *output
		if !filepath.IsAbs(dest) {
			dest = filepath.Join(absolute, dest)
		}
		switch *mode {
		case "all":
			err = site.Assemble(absolute, dest)
		case "web":
			err = site.AssembleWeb(absolute, dest)
		case "media":
			err = site.AssembleMedia(absolute, dest)
		default:
			err = fmt.Errorf("unknown assembly mode %q", *mode)
		}
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Printf("Assembled %s assets into %s\n", *mode, *output)
}
