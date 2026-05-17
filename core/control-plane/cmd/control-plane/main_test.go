package main

import "testing"

func TestControlSurrealDBConfigUsesSharedDefaults(t *testing.T) {
	t.Setenv("CLOUDGRID_SURREALDB_URL", "")
	t.Setenv("CLOUDGRID_SURREALDB_NAMESPACE", "")
	t.Setenv("CLOUDGRID_SURREALDB_DATABASE", "")
	t.Setenv("CLOUDGRID_SURREALDB_USERNAME", "")
	t.Setenv("CLOUDGRID_SURREALDB_PASSWORD", "")

	config := controlSurrealDBConfig()
	if config.URL != defaultSurrealDBURL {
		t.Fatalf("URL = %q, want %q", config.URL, defaultSurrealDBURL)
	}
	if config.Namespace != defaultSurrealDBNamespace {
		t.Fatalf("Namespace = %q, want %q", config.Namespace, defaultSurrealDBNamespace)
	}
	if config.Database != defaultSurrealDBDatabase {
		t.Fatalf("Database = %q, want %q", config.Database, defaultSurrealDBDatabase)
	}
	if config.Username != defaultSurrealDBUsername {
		t.Fatalf("Username = %q, want %q", config.Username, defaultSurrealDBUsername)
	}
	if config.Password != defaultSurrealDBPassword {
		t.Fatalf("Password = %q, want %q", config.Password, defaultSurrealDBPassword)
	}
}
