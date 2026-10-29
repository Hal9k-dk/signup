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
	flag.Parse()
	absolute, err := filepath.Abs(*root)
	if err == nil {
		err = site.Assemble(absolute, filepath.Join(absolute, "cmd/server/embedded"))
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println("Assembled independent projects into cmd/server/embedded")
}
