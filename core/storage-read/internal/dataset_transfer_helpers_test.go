package internal

import "testing"

func TestDatasetTransferHelperBranches(t *testing.T) {
	t.Setenv("CLOUDGRID_DATASET_TRANSFER_DIR", " /tmp/cloudgrid-transfer ")
	if got := TransferRootForAdapter(); got != "/tmp/cloudgrid-transfer" {
		t.Fatalf("TransferRootForAdapter() = %q", got)
	}
	t.Setenv("CLOUDGRID_DATASET_TRANSFER_DIR", "")
	if got := TransferRootForAdapter(); got != ".cloudgrid/dataset-transfer" {
		t.Fatalf("TransferRootForAdapter(default) = %q", got)
	}
	if got := stringInputValue(map[string]any{"name": " dataset "}, "name"); got != "dataset" {
		t.Fatalf("stringInputValue() = %q", got)
	}
	for _, input := range []map[string]any{
		{"value": 3},
		{"value": int64(3)},
		{"value": float64(3)},
	} {
		if got := intInputValue(input, "value"); got != 3 {
			t.Fatalf("intInputValue(%#v) = %d", input, got)
		}
	}
	if transferValueOrDefault(nil, "fallback") != "fallback" || transferValueOrDefault("value", "fallback") != "value" {
		t.Fatal("transferValueOrDefault returned unexpected value")
	}
	if nullableValue("") != nil || nullableValue("value") != "value" {
		t.Fatal("nullableValue returned unexpected value")
	}
	if left, right := stableTransferID("export", "dataset", "1"), stableTransferID("export", "dataset", "1"); left == "" || left != right {
		t.Fatalf("stableTransferID not stable: %q/%q", left, right)
	}
}
