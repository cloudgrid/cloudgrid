package scoring

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

type Result struct {
	Score  float64
	Passed bool
}

type ExactJSONScorer struct{}

func (ExactJSONScorer) Score(expected any, output any) (Result, error) {
	expectedJSON, err := json.Marshal(expected)
	if err != nil {
		return Result{}, err
	}

	outputJSON, err := json.Marshal(output)
	if err != nil {
		return Result{}, err
	}

	if bytes.Equal(expectedJSON, outputJSON) {
		return Result{Score: 1, Passed: true}, nil
	}

	return Result{Score: 0, Passed: false}, nil
}

type DefinitionScorer struct{}

func (DefinitionScorer) Score(definition map[string]any, value any) (Result, error) {
	definitionType, _ := definition["type"].(string)
	text := stringify(value)
	switch definitionType {
	case "contains":
		needle, _ := definition["value"].(string)
		if needle == "" {
			return Result{}, fmt.Errorf("contains scorer value is required")
		}
		caseSensitive, _ := definition["caseSensitive"].(bool)
		if !caseSensitive {
			text = strings.ToLower(text)
			needle = strings.ToLower(needle)
		}
		if strings.Contains(text, needle) {
			return Result{Score: 1, Passed: true}, nil
		}
		return Result{Score: 0, Passed: false}, nil
	case "regex":
		pattern, _ := definition["pattern"].(string)
		if pattern == "" {
			return Result{}, fmt.Errorf("regex scorer pattern is required")
		}
		flags, _ := definition["flags"].(string)
		expression := pattern
		if flags != "" {
			expression = "(?" + flags + ")" + pattern
		}
		matched, err := regexp.MatchString(expression, text)
		if err != nil {
			return Result{}, err
		}
		if matched {
			return Result{Score: 1, Passed: true}, nil
		}
		return Result{Score: 0, Passed: false}, nil
	default:
		return Result{}, fmt.Errorf("deterministic scorer type %q is unsupported", definitionType)
	}
}

func stringify(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Sprint(value)
	}
	return string(data)
}
