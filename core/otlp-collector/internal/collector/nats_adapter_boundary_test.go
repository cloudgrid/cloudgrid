package collector

import (
	"go/parser"
	"go/token"
	"path/filepath"
	"strings"
	"testing"
)

func TestNATSImportsStayInAdapterNamedFiles(t *testing.T) {
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") || strings.Contains(file, "nats") {
			continue
		}
		parsed, err := parser.ParseFile(token.NewFileSet(), file, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatalf("parse %s: %v", file, err)
		}
		for _, imported := range parsed.Imports {
			if strings.Contains(strings.Trim(imported.Path.Value, `"`), "nats-io/nats.go") {
				t.Fatalf("%s imports NATS; move transport-native code into an adapter-named file", file)
			}
		}
	}
}
