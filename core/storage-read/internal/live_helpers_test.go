package internal

import "testing"

func TestNumberValueAcceptsNumericTypesAndRejectsNonNumbers(t *testing.T) {
	tests := []struct {
		name  string
		value any
		want  float64
		ok    bool
	}{
		{name: "int", value: 7, want: 7, ok: true},
		{name: "int64", value: int64(8), want: 8, ok: true},
		{name: "float64", value: 9.5, want: 9.5, ok: true},
		{name: "float32", value: float32(10.25), want: 10.25, ok: true},
		{name: "string", value: "10", ok: false},
		{name: "nil", value: nil, ok: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, ok := numberValue(test.value)
			if ok != test.ok || got != test.want {
				t.Fatalf("numberValue(%#v) = (%v, %v), want (%v, %v)", test.value, got, ok, test.want, test.ok)
			}
		})
	}
}
