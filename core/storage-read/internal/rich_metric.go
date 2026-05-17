package internal

import (
	"context"
	"fmt"
	"sort"
	"strings"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

type metricSeriesQuerier interface {
	QueryMetricSeries(ctx context.Context, input contracts.MetricSeriesInput, authContext *contracts.AuthContext) (contracts.MetricSeriesData, error)
}

func QueryRichMetricSeriesFromMetricSeries(ctx context.Context, store metricSeriesQuerier, input contracts.RichMetricSeriesInput, authContext *contracts.AuthContext) (contracts.RichMetricSeriesData, error) {
	if err := validateRichMetricSeriesInput(input); err != nil {
		return contracts.RichMetricSeriesData{}, err
	}
	interval := strings.TrimSpace(optionalRichMetricString(input.Query.Interval))
	if interval == "" {
		interval = "auto"
	}
	data := contracts.RichMetricSeriesData{
		Interval:      interval,
		Series:        []contracts.RichMetricSeries{},
		DisplaySeries: []contracts.RichMetricDisplaySeries{},
		Warnings:      []contracts.MetricQueryWarning{},
	}
	sources := map[string][]contracts.RichMetricSeries{}
	for _, query := range input.Query.Queries {
		rowInput := contracts.MetricSeriesInput{
			MetricName:  strings.TrimSpace(query.MetricName),
			From:        input.From,
			To:          input.To,
			Interval:    input.Query.Interval,
			Aggregation: query.Aggregation,
			GroupBy:     query.GroupBy,
			Filters:     query.Filters,
		}
		seriesData, err := store.QueryMetricSeries(ctx, rowInput, authContext)
		if err != nil {
			return contracts.RichMetricSeriesData{}, err
		}
		if seriesData.Interval != "" && (data.Interval == "auto" || data.Interval == "") {
			data.Interval = seriesData.Interval
		}
		series := richSeriesFromMetricSeries(query.ID, query.Label, seriesData)
		if query.MaxSeries != nil && len(series) > *query.MaxSeries {
			series = series[:*query.MaxSeries]
			data.Warnings = append(data.Warnings, contracts.MetricQueryWarning{Code: "SERIES_LIMIT", Message: "metric query returned more series than maxSeries"})
		}
		sources[query.ID] = series
		data.Series = append(data.Series, series...)
	}
	for _, formula := range input.Query.Formulas {
		series, warnings, err := evaluateRichMetricFormula(formula, sources)
		if err != nil {
			return contracts.RichMetricSeriesData{}, err
		}
		data.Warnings = append(data.Warnings, warnings...)
		sources[formula.ID] = series
		data.Series = append(data.Series, series...)
	}
	if len(input.Query.DisplaySeries) == 0 {
		for _, query := range input.Query.Queries {
			data.DisplaySeries = append(data.DisplaySeries, contracts.RichMetricDisplaySeries{
				ID:       query.ID,
				Label:    query.Label,
				SourceID: query.ID,
				Visible:  true,
			})
		}
		for _, formula := range input.Query.Formulas {
			data.DisplaySeries = append(data.DisplaySeries, contracts.RichMetricDisplaySeries{
				ID:       formula.ID,
				Label:    formula.Label,
				SourceID: formula.ID,
				Visible:  true,
			})
		}
	} else {
		for _, display := range input.Query.DisplaySeries {
			visible := true
			if display.Visible != nil {
				visible = *display.Visible
			}
			data.DisplaySeries = append(data.DisplaySeries, contracts.RichMetricDisplaySeries{
				ID:       strings.TrimSpace(display.ID),
				Label:    strings.TrimSpace(display.Label),
				SourceID: strings.TrimSpace(display.SourceID),
				Visible:  visible,
			})
		}
	}
	return data, nil
}

func validateRichMetricSeriesInput(input contracts.RichMetricSeriesInput) error {
	if !input.From.Before(input.To) {
		return validationError("from must be before to")
	}
	if len(input.Query.Queries) == 0 || len(input.Query.Queries) > 8 || len(input.Query.Formulas) > 8 || len(input.Query.DisplaySeries) > 20 {
		return validationError("rich metric query exceeds limits")
	}
	available := map[string]struct{}{}
	for _, query := range input.Query.Queries {
		if strings.TrimSpace(query.ID) == "" || strings.TrimSpace(query.Label) == "" || strings.TrimSpace(query.MetricName) == "" {
			return validationError("rich metric query rows require id, label, and metricName")
		}
		if _, ok := available[query.ID]; ok {
			return validationError("rich metric query ids must be unique")
		}
		available[query.ID] = struct{}{}
	}
	for _, formula := range input.Query.Formulas {
		if strings.TrimSpace(formula.ID) == "" || strings.TrimSpace(formula.Label) == "" {
			return validationError("rich metric formulas require id and label")
		}
		if _, ok := available[formula.ID]; ok {
			return validationError("rich metric query ids must be unique")
		}
		if err := validateRichFormulaExpression(formula.Expression, available, 1); err != nil {
			return err
		}
		available[formula.ID] = struct{}{}
	}
	for _, display := range input.Query.DisplaySeries {
		if strings.TrimSpace(display.ID) == "" || strings.TrimSpace(display.Label) == "" || strings.TrimSpace(display.SourceID) == "" {
			return validationError("rich metric display series require id, label, and sourceId")
		}
		if _, ok := available[display.SourceID]; !ok {
			return validationError("rich metric display series source is unknown")
		}
	}
	return nil
}

func validateRichFormulaExpression(expression contracts.DashboardMetricFormulaExpressionInput, available map[string]struct{}, depth int) error {
	if depth > 8 {
		return validationError("rich metric formula expression is too deep")
	}
	switch expression.Kind {
	case contracts.DashboardMetricFormulaExpressionKindRef:
		if expression.RefID == nil || strings.TrimSpace(*expression.RefID) == "" {
			return validationError("rich metric formula refId is required")
		}
		if _, ok := available[strings.TrimSpace(*expression.RefID)]; !ok {
			return validationError("rich metric formula reference is unknown")
		}
		return nil
	case contracts.DashboardMetricFormulaExpressionKindNumber:
		if expression.Value == nil {
			return validationError("rich metric formula number value is required")
		}
		return nil
	case contracts.DashboardMetricFormulaExpressionKindBinary:
		if expression.Operator == nil || !validRichMetricBinaryOperator(*expression.Operator) || expression.Left == nil || expression.Right == nil {
			return validationError("rich metric binary formula is invalid")
		}
		if err := validateRichFormulaExpression(*expression.Left, available, depth+1); err != nil {
			return err
		}
		return validateRichFormulaExpression(*expression.Right, available, depth+1)
	case contracts.DashboardMetricFormulaExpressionKindFunction:
		if expression.Function == nil || *expression.Function != contracts.DashboardMetricFormulaFunctionRatio || len(expression.Arguments) != 2 {
			return validationError("rich metric formula function is not supported")
		}
		for _, argument := range expression.Arguments {
			if err := validateRichFormulaExpression(argument, available, depth+1); err != nil {
				return err
			}
		}
		return nil
	default:
		return validationError("rich metric formula expression kind is not supported")
	}
}

func richSeriesFromMetricSeries(sourceID string, label string, data contracts.MetricSeriesData) []contracts.RichMetricSeries {
	items := make([]contracts.RichMetricSeries, 0, len(data.Series))
	var unit *string
	if strings.TrimSpace(data.Metric.Unit) != "" {
		unit = &data.Metric.Unit
	}
	for index, series := range data.Series {
		id := sourceID
		if len(data.Series) > 1 {
			id = fmt.Sprintf("%s:%d", sourceID, index)
		}
		items = append(items, contracts.RichMetricSeries{
			ID:       id,
			Label:    richMetricSeriesLabel(label, series.Labels),
			SourceID: sourceID,
			Unit:     unit,
			Labels:   cloneAttributes(series.Labels),
			Points:   cloneMetricPoints(series.Points),
		})
	}
	return items
}

func evaluateRichMetricFormula(formula contracts.DashboardMetricFormulaInput, sources map[string][]contracts.RichMetricSeries) ([]contracts.RichMetricSeries, []contracts.MetricQueryWarning, error) {
	value, warnings, err := evaluateRichFormulaExpression(formula.Expression, sources)
	if err != nil {
		return nil, nil, err
	}
	for index := range value {
		value[index].ID = fmt.Sprintf("%s:%d", formula.ID, index)
		if len(value) == 1 {
			value[index].ID = formula.ID
		}
		value[index].Label = formula.Label
		value[index].SourceID = formula.ID
		value[index].Unit = formula.Unit
	}
	return value, warnings, nil
}

func evaluateRichFormulaExpression(expression contracts.DashboardMetricFormulaExpressionInput, sources map[string][]contracts.RichMetricSeries) ([]contracts.RichMetricSeries, []contracts.MetricQueryWarning, error) {
	switch expression.Kind {
	case contracts.DashboardMetricFormulaExpressionKindRef:
		return cloneRichSeriesSlice(sources[strings.TrimSpace(*expression.RefID)]), nil, nil
	case contracts.DashboardMetricFormulaExpressionKindNumber:
		return []contracts.RichMetricSeries{{Labels: contracts.Attributes{}, Points: []contracts.MetricSeriesPoint{{Value: *expression.Value, Exemplars: []contracts.MetricExemplar{}}}}}, nil, nil
	case contracts.DashboardMetricFormulaExpressionKindBinary:
		left, leftWarnings, err := evaluateRichFormulaExpression(*expression.Left, sources)
		if err != nil {
			return nil, nil, err
		}
		right, rightWarnings, err := evaluateRichFormulaExpression(*expression.Right, sources)
		if err != nil {
			return nil, nil, err
		}
		result, warnings := applyBinaryRichMetricSeries(*expression.Operator, left, right)
		return result, append(leftWarnings, append(rightWarnings, warnings...)...), nil
	case contracts.DashboardMetricFormulaExpressionKindFunction:
		operator := contracts.DashboardMetricFormulaBinaryOperatorDivide
		left, leftWarnings, err := evaluateRichFormulaExpression(expression.Arguments[0], sources)
		if err != nil {
			return nil, nil, err
		}
		right, rightWarnings, err := evaluateRichFormulaExpression(expression.Arguments[1], sources)
		if err != nil {
			return nil, nil, err
		}
		result, warnings := applyBinaryRichMetricSeries(operator, left, right)
		return result, append(leftWarnings, append(rightWarnings, warnings...)...), nil
	default:
		return nil, nil, validationError("rich metric formula expression kind is not supported")
	}
}

func applyBinaryRichMetricSeries(operator contracts.DashboardMetricFormulaBinaryOperator, left []contracts.RichMetricSeries, right []contracts.RichMetricSeries) ([]contracts.RichMetricSeries, []contracts.MetricQueryWarning) {
	if len(left) == 1 && len(right) > 1 {
		left = repeatRichSeries(left[0], len(right))
	}
	if len(right) == 1 && len(left) > 1 {
		right = repeatRichSeries(right[0], len(left))
	}
	limit := len(left)
	if len(right) < limit {
		limit = len(right)
	}
	result := make([]contracts.RichMetricSeries, 0, limit)
	warnings := []contracts.MetricQueryWarning{}
	if len(left) != len(right) {
		warnings = append(warnings, contracts.MetricQueryWarning{Code: "SERIES_ALIGNMENT", Message: "formula inputs have incompatible series counts"})
	}
	for index := 0; index < limit; index++ {
		points, pointWarnings := applyBinaryMetricPoints(operator, left[index].Points, right[index].Points)
		warnings = append(warnings, pointWarnings...)
		result = append(result, contracts.RichMetricSeries{Labels: cloneAttributes(left[index].Labels), Points: points})
	}
	return result, warnings
}

func applyBinaryMetricPoints(operator contracts.DashboardMetricFormulaBinaryOperator, left []contracts.MetricSeriesPoint, right []contracts.MetricSeriesPoint) ([]contracts.MetricSeriesPoint, []contracts.MetricQueryWarning) {
	if scalar, ok := metricPointScalar(right); ok {
		return applyScalarToMetricPoints(operator, left, scalar, false)
	}
	if scalar, ok := metricPointScalar(left); ok {
		return applyScalarToMetricPoints(operator, right, scalar, true)
	}
	rightByTimestamp := map[string]contracts.MetricSeriesPoint{}
	for _, point := range right {
		rightByTimestamp[point.Timestamp.UTC().Format(timeKeyFormat)] = point
	}
	points := []contracts.MetricSeriesPoint{}
	warnings := []contracts.MetricQueryWarning{}
	for _, leftPoint := range left {
		rightPoint, ok := rightByTimestamp[leftPoint.Timestamp.UTC().Format(timeKeyFormat)]
		if !ok {
			warnings = append(warnings, contracts.MetricQueryWarning{Code: "POINT_ALIGNMENT", Message: "formula inputs have incompatible timestamps"})
			continue
		}
		value, ok := applyBinaryMetricValue(operator, leftPoint.Value, rightPoint.Value)
		if !ok {
			warnings = append(warnings, contracts.MetricQueryWarning{Code: "DIVIDE_BY_ZERO", Message: "formula skipped a division by zero point"})
			continue
		}
		points = append(points, contracts.MetricSeriesPoint{Timestamp: leftPoint.Timestamp, Value: value, Exemplars: []contracts.MetricExemplar{}})
	}
	sort.Slice(points, func(i, j int) bool {
		return points[i].Timestamp.Before(points[j].Timestamp)
	})
	return points, warnings
}

const timeKeyFormat = "2006-01-02T15:04:05.000000000Z07:00"

func metricPointScalar(points []contracts.MetricSeriesPoint) (float64, bool) {
	if len(points) != 1 || !points[0].Timestamp.IsZero() {
		return 0, false
	}
	return points[0].Value, true
}

func applyScalarToMetricPoints(operator contracts.DashboardMetricFormulaBinaryOperator, points []contracts.MetricSeriesPoint, scalar float64, scalarOnLeft bool) ([]contracts.MetricSeriesPoint, []contracts.MetricQueryWarning) {
	result := make([]contracts.MetricSeriesPoint, 0, len(points))
	warnings := []contracts.MetricQueryWarning{}
	for _, point := range points {
		left := point.Value
		right := scalar
		if scalarOnLeft {
			left = scalar
			right = point.Value
		}
		value, ok := applyBinaryMetricValue(operator, left, right)
		if !ok {
			warnings = append(warnings, contracts.MetricQueryWarning{Code: "DIVIDE_BY_ZERO", Message: "formula skipped a division by zero point"})
			continue
		}
		result = append(result, contracts.MetricSeriesPoint{Timestamp: point.Timestamp, Value: value, Exemplars: []contracts.MetricExemplar{}})
	}
	return result, warnings
}

func validRichMetricBinaryOperator(operator contracts.DashboardMetricFormulaBinaryOperator) bool {
	switch operator {
	case contracts.DashboardMetricFormulaBinaryOperatorAdd, contracts.DashboardMetricFormulaBinaryOperatorSubtract, contracts.DashboardMetricFormulaBinaryOperatorMultiply, contracts.DashboardMetricFormulaBinaryOperatorDivide:
		return true
	default:
		return false
	}
}

func applyBinaryMetricValue(operator contracts.DashboardMetricFormulaBinaryOperator, left float64, right float64) (float64, bool) {
	switch operator {
	case contracts.DashboardMetricFormulaBinaryOperatorAdd:
		return left + right, true
	case contracts.DashboardMetricFormulaBinaryOperatorSubtract:
		return left - right, true
	case contracts.DashboardMetricFormulaBinaryOperatorMultiply:
		return left * right, true
	case contracts.DashboardMetricFormulaBinaryOperatorDivide:
		if right == 0 {
			return 0, false
		}
		return left / right, true
	default:
		return 0, false
	}
}

func richMetricSeriesLabel(base string, labels contracts.Attributes) string {
	if len(labels) == 0 {
		return base
	}
	keys := make([]string, 0, len(labels))
	for key := range labels {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, fmt.Sprintf("%s=%v", key, labels[key]))
	}
	return fmt.Sprintf("%s {%s}", base, strings.Join(parts, ", "))
}

func cloneRichSeriesSlice(items []contracts.RichMetricSeries) []contracts.RichMetricSeries {
	result := make([]contracts.RichMetricSeries, 0, len(items))
	for _, item := range items {
		result = append(result, contracts.RichMetricSeries{
			ID:       item.ID,
			Label:    item.Label,
			SourceID: item.SourceID,
			Unit:     item.Unit,
			Labels:   cloneAttributes(item.Labels),
			Points:   cloneMetricPoints(item.Points),
		})
	}
	return result
}

func repeatRichSeries(item contracts.RichMetricSeries, count int) []contracts.RichMetricSeries {
	result := make([]contracts.RichMetricSeries, 0, count)
	for index := 0; index < count; index++ {
		result = append(result, item)
	}
	return result
}

func cloneAttributes(input contracts.Attributes) contracts.Attributes {
	if input == nil {
		return contracts.Attributes{}
	}
	result := contracts.Attributes{}
	for key, value := range input {
		result[key] = value
	}
	return result
}

func cloneMetricPoints(input []contracts.MetricSeriesPoint) []contracts.MetricSeriesPoint {
	result := make([]contracts.MetricSeriesPoint, 0, len(input))
	for _, point := range input {
		exemplars := append([]contracts.MetricExemplar{}, point.Exemplars...)
		result = append(result, contracts.MetricSeriesPoint{Timestamp: point.Timestamp, Value: point.Value, Count: point.Count, Exemplars: exemplars})
	}
	return result
}

func optionalRichMetricString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
